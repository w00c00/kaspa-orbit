// Exact-profile script-engine probes. Random, unfunded keys; no network.
include!("kcc20_tests.rs");

fn orbit_program(pk: &[u8], amount: i64, minter: bool) -> Vec<u8> {
    let artifact: serde_json::Value = serde_json::from_str(&fs::read_to_string(
        format!("{}/test/fixtures/kcc20-2433.json", std::env::var("ORBIT_WALLET_ROOT").expect("wallet checkout"))
    ).unwrap()).unwrap();
    let hex = artifact["programHex"].as_str().unwrap();
    let mut program = vec![0; hex.len()/2];
    faster_hex::hex_decode(hex.as_bytes(), &mut program).unwrap();
    assert_eq!(program.len(), 2433);
    assert_eq!(&program[..1], &[32]);
    program[1..33].copy_from_slice(pk);
    program[34] = 0; // signature ownership
    program[36..44].copy_from_slice(&orbit_i64(amount));
    program[45] = minter as u8;
    program
}

fn orbit_i64(n: i64) -> [u8; 8] {
    let mut bytes = n.unsigned_abs().to_le_bytes();
    if n < 0 { bytes[7] |= 0x80; }
    bytes
}

#[test]
fn orbit_wallet_assembled_signed_transaction() {
    fn hex(v: &serde_json::Value) -> Vec<u8> {
        let s=v.as_str().unwrap();let mut bytes=vec![0;s.len()/2];faster_hex::hex_decode(s.as_bytes(),&mut bytes).unwrap();bytes
    }
    fn script(v: &serde_json::Value) -> ScriptPublicKey {
        let bytes=hex(v);assert_eq!(&bytes[..2],&[0,0]);ScriptPublicKey::from_vec(0,bytes[2..].to_vec())
    }
    let root=std::env::var("ORBIT_WALLET_ROOT").expect("wallet checkout");
    for mode in ["single","merge","split"] {
        let result=std::process::Command::new("node").arg(format!("{root}/scripts/probe-kcc20-signed.cjs")).arg(mode).output().unwrap();
        assert!(result.status.success(),"wallet assembly/signing failed: {}",String::from_utf8_lossy(&result.stderr));
        let data:serde_json::Value=serde_json::from_slice(&result.stdout).unwrap();
        let mut inputs=vec![];let mut entries=vec![];
        for input in data["inputs"].as_array().unwrap(){
            inputs.push(TransactionInput::new_with_compute_budget(TransactionOutpoint {
                transaction_id:TransactionId::from_bytes(hex(&input["transactionId"]).try_into().unwrap()),index:input["index"].as_u64().unwrap() as u32
            },hex(&input["signatureScript"]),input["sequence"].as_str().unwrap().parse().unwrap(),input["computeBudget"].as_u64().unwrap() as u16));
            let u=&input["utxo"];
            entries.push(UtxoEntry::new(u["amount"].as_str().unwrap().parse().unwrap(),script(&u["scriptPublicKey"]),
                u["blockDaaScore"].as_str().unwrap().parse().unwrap(),u["isCoinbase"].as_bool().unwrap(),
                if u["covenantId"].is_null(){None}else{Some(Hash::from_bytes(hex(&u["covenantId"]).try_into().unwrap()))}));
        }
        let outputs=data["outputs"].as_array().unwrap().iter().map(|o|TransactionOutput {
            value:o["value"].as_str().unwrap().parse().unwrap(),script_public_key:script(&o["scriptPublicKey"]),
            covenant:if o["covenant"].is_null(){None}else{Some(CovenantBinding{authorizing_input:o["covenant"]["authorizingInput"].as_u64().unwrap() as u16,
                covenant_id:Hash::from_bytes(hex(&o["covenant"]["covenantId"]).try_into().unwrap())})}
        }).collect();
        assert_eq!(data["version"].as_u64(),Some(1));assert_eq!(data["payload"].as_str(),Some(""));
        let tx=Transaction::new(1,inputs,outputs,0,Default::default(),0,vec![]);
        tx.set_storage_mass(data["storageMass"].as_str().unwrap().parse().unwrap());
        assert_eq!(faster_hex::hex_string(&tx.id().as_bytes()),data["id"].as_str().unwrap(),"Rust and wallet transaction IDs diverged");
        let result=orbit_execute(tx.clone(),entries.clone());
        println!("ORBIT wallet assembled {mode}: {result:?}");assert!(result.is_ok());
        let mut altered=tx.clone();altered.outputs.last_mut().unwrap().value-=1;altered.finalize();
        let result=orbit_execute(altered,entries.clone());
        println!("ORBIT wallet assembled {mode} altered change: {result:?}");assert!(result.is_err());
        let mut unsigned=tx;unsigned.inputs.last_mut().unwrap().signature_script.clear();unsigned.finalize();
        let result=orbit_execute(unsigned,entries);
        println!("ORBIT wallet assembled {mode} missing signature: {result:?}");assert!(result.is_err());
    }
}

#[test]
fn orbit_merge_identity_and_order() {
    for (name, count, owner_first, foreign_input, foreign_output, expected) in [
        ("merge two notes",2,false,false,false,true),
        ("owner input first",2,true,false,false,true),
        ("foreign token input",2,false,true,false,false),
        ("foreign token output",2,false,false,true,false),
        ("four note limit",4,false,false,false,true),
        ("five notes rejected",5,false,false,false,false),
    ] {
        let key=random_keypair();let pk=key.x_only_public_key().0.serialize();
        let mut note=orbit_program(&pk,1000,false);note[34]=3;
        let mut output_note=orbit_program(&pk,1000*count as i64,false);output_note[34]=3;
        let mut p2pk=vec![32];p2pk.extend(pk);p2pk.push(0xac);
        let token_entry=UtxoEntry::new(1000,pay_to_script_hash_script(&note),0,false,Some(COV_A));
        let owner_entry=UtxoEntry::new(1000,ScriptPublicKey::from_vec(0,p2pk),0,false,None);
        let mut entries=vec![token_entry;count];
        if foreign_input {entries[count-1].covenant_id=Some(COV_B);}
        let owner_index=if owner_first {0} else {count};
        entries.insert(owner_index,owner_entry);
        let auth=if owner_first {1} else {0};
        let outputs=vec![TransactionOutput {value:1000,script_public_key:pay_to_script_hash_script(&output_note),
            covenant:Some(CovenantBinding {authorizing_input:auth,covenant_id:if foreign_output {COV_B} else {COV_A}})}];
        let inputs:Vec<_>=(0..entries.len()).map(|index|TransactionInput::new_with_compute_budget(
            TransactionOutpoint {transaction_id:TransactionId::from_bytes([93;32]),index:index as u32},vec![],0,400)).collect();
        let unsigned=Transaction::new(1,inputs.clone(),outputs.clone(),0,Default::default(),0,vec![]);
        let sig=sign_tx_input(unsigned,entries.clone(),owner_index,&key);
        let mut unlock=Vec::new();
        for field in [&pk[..],&[3],&orbit_i64(1000*count as i64),&[0],&[],&vec![owner_index as u8;count],&note] {orbit_push(&mut unlock,field);}
        let mut signed=inputs;
        for (i,input) in signed.iter_mut().enumerate(){if i==owner_index {orbit_push(&mut input.signature_script,&sig);} else {input.signature_script=unlock.clone();}}
        let tx=Transaction::new(1,signed,outputs,0,Default::default(),0,vec![]);
        let result=orbit_execute(tx,entries);
        println!("ORBIT {name}: {result:?}");
        assert_eq!(result.is_ok(),expected,"{name}: {result:?}");
    }
}

fn orbit_push(out: &mut Vec<u8>, bytes: &[u8]) {
    match bytes.len() {
        n @ 0..=75 => out.push(n as u8),
        n @ 76..=255 => out.extend([0x4c, n as u8]),
        n => {out.push(0x4d); out.extend((n as u16).to_le_bytes());}
    }
    out.extend(bytes);
}

fn orbit_execute(tx: Transaction, entries: Vec<UtxoEntry>) -> Result<(), kaspa_txscript_errors::TxScriptError> {
    use kaspa_consensus_core::tx::VerifiableTransaction;
    use kaspa_txscript::{EngineCtx, EngineFlags, TxScriptEngine};
    use kaspa_txscript::{caches::Cache, covenants::CovenantsContext};
    let reused = SigHashReusedValuesUnsync::new();
    let cache = Cache::new(10000);
    let populated = PopulatedTransaction::new(&tx, entries);
    let context = CovenantsContext::from_tx(&populated).map_err(kaspa_txscript_errors::TxScriptError::from)?;
    for (i, input) in tx.inputs.iter().enumerate() {
        TxScriptEngine::from_transaction_input(&populated, input, i, populated.utxo(i).unwrap(),
            EngineCtx::new(&cache).with_reused(&reused).with_covenants_ctx(&context),
            EngineFlags {covenants_enabled:true, sigop_script_units:100_000.into()}).execute()?;
    }
    Ok(())
}

#[test]
fn orbit_address_cospend_authorization() {
    for (name, wrong_owner, missing_signature, bad_signature, witness, expected) in [
        ("authorized address cospend", false, false, false, 1u8, true),
        ("wrong owner input", true, false, false, 1, false),
        ("unsigned owner input", false, true, false, 1, false),
        ("invalid owner signature", false, false, true, 1, false),
        ("witness points to token", false, false, false, 0, false),
        ("witness out of range", false, false, false, 2, false),
    ] {
        let owner=random_keypair(); let stranger=random_keypair();
        let owner_pk=owner.x_only_public_key().0.serialize();
        let signer=if wrong_owner {&stranger} else {&owner};
        let signer_pk=signer.x_only_public_key().0.serialize();
        let mut token=orbit_program(&owner_pk,1000,false); token[34]=3;
        let mut p2pk=vec![32]; p2pk.extend(signer_pk); p2pk.push(0xac);
        let entries=vec![
            UtxoEntry::new(1000,pay_to_script_hash_script(&token),0,false,Some(COV_A)),
            UtxoEntry::new(1000,ScriptPublicKey::from_vec(0,p2pk),0,false,None),
        ];
        let outputs=vec![TransactionOutput {value:1000,script_public_key:pay_to_script_hash_script(&token),
            covenant:Some(CovenantBinding {authorizing_input:0,covenant_id:COV_A})}];
        let inputs: Vec<_>=(0..2).map(|index|TransactionInput::new_with_compute_budget(
            TransactionOutpoint {transaction_id:TransactionId::from_bytes([91;32]),index},vec![],0,400)).collect();
        let unsigned=Transaction::new(1,inputs.clone(),outputs.clone(),0,Default::default(),0,vec![]);
        let sig=sign_tx_input(unsigned,entries.clone(),1,if bad_signature {&stranger} else {signer});
        let mut unlock=Vec::new();
        for field in [&owner_pk[..],&[3],&orbit_i64(1000),&[0],&[],&[witness],&token] {orbit_push(&mut unlock,field);}
        if name == "authorized address cospend" {
            let root=std::env::var("ORBIT_WALLET_ROOT").expect("explicit wallet root for codec execution");
            let data=serde_json::json!({"program":faster_hex::hex_string(&token),"outputs":[{"owner":faster_hex::hex_string(&owner_pk),"identifierType":3,"amount":"1000"}]});
            let result=std::process::Command::new("node").arg("-e")
                .arg("const d=JSON.parse(process.argv[1]);const c=require(process.argv[2]+'/desktop/kcc20-codec.cjs');process.stdout.write(c.encodeAddressUnlock(d.program,d.outputs,{tokenInputCount:1,ownerInputIndex:1,totalInputCount:2}));")
                .arg(data.to_string()).arg(root).output().expect("run wallet codec");
            assert!(result.status.success(),"wallet codec failed");
            let generated=String::from_utf8(result.stdout).unwrap();
            let mut decoded=vec![0;generated.len()/2];faster_hex::hex_decode(generated.as_bytes(),&mut decoded).unwrap();
            assert_eq!(decoded,unlock,"wallet codec differs from executed ABI");
            unlock=decoded; // The actual engine receives the wallet-generated bytes.
        }
        let mut signed=inputs; signed[0].signature_script=unlock;
        if !missing_signature {orbit_push(&mut signed[1].signature_script,&sig);}
        let tx=Transaction::new(1,signed,outputs,0,Default::default(),0,vec![]);
        let result=orbit_execute(tx,entries);
        println!("ORBIT {name}: {result:?}");
        assert_eq!(result.is_ok(),expected,"{name}: {result:?}");
    }
}

#[test]
fn orbit_exact_program_transfer_boundaries() {
    for (name, amounts, wrong_signer, mint, expected) in [
        ("full transfer", vec![1000], false, false, true),
        ("split", vec![400, 600], false, false, true),
        ("wrong signature", vec![1000], true, false, false),
        ("inflation", vec![1001], false, false, false),
        ("negative output", vec![1100, -100], false, false, false),
        ("zero output", vec![1000, 0], false, false, false),
        ("create minter", vec![1000], false, true, false),
    ] {
        let key = random_keypair(); let other = random_keypair();
        let pk = key.x_only_public_key().0.serialize();
        let input_program = orbit_program(&pk, 1000, false);
        let entry = UtxoEntry::new(1000, pay_to_script_hash_script(&input_program), 0, false, Some(COV_A));
        let outputs: Vec<_> = amounts.iter().map(|a| TransactionOutput {
            value: 400, script_public_key: pay_to_script_hash_script(&orbit_program(&pk, *a, mint)),
            covenant: Some(CovenantBinding {authorizing_input: 0, covenant_id: COV_A})
        }).collect();
        let outpoint = TransactionOutpoint {transaction_id: TransactionId::from_bytes([87;32]), index:0};
        let unsigned = Transaction::new(1, vec![TransactionInput::new_with_compute_budget(outpoint, vec![], 0, 400)], outputs.clone(), 0, Default::default(), 0, vec![]);
        let signature = sign_tx_input(unsigned, vec![entry.clone()], 0, if wrong_signer {&other} else {&key});
        let mut unlock = Vec::new();
        orbit_push(&mut unlock, &pk.repeat(amounts.len()));
        orbit_push(&mut unlock, &vec![0;amounts.len()]);
        orbit_push(&mut unlock, &amounts.iter().flat_map(|a| orbit_i64(*a)).collect::<Vec<_>>());
        orbit_push(&mut unlock, &vec![mint as u8;amounts.len()]);
        orbit_push(&mut unlock, &signature);
        orbit_push(&mut unlock, &[0]);
        orbit_push(&mut unlock, &input_program);
        let tx = Transaction::new(1, vec![TransactionInput::new_with_compute_budget(outpoint, unlock, 0, 400)], outputs, 0, Default::default(), 0, vec![]);
        let result = orbit_execute(tx, vec![entry]);
        println!("ORBIT {name}: {result:?}");
        assert_eq!(result.is_ok(), expected, "{name}: {result:?}");
    }
}
