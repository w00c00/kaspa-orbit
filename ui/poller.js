(function(root){
 class Poller {
  constructor({enabled,context,run,onError=()=>{},interval=30000,schedule=(fn,ms)=>setTimeout(fn,ms),cancel=id=>clearTimeout(id)}){Object.assign(this,{enabled,context,run,onError,interval,schedule,cancel});this.busy=false;this.stopped=false;this.timer=null;}
  async tick(){
   if(this.stopped||this.busy)return;
   this.busy=true;const context=this.context();const valid=()=>!this.stopped&&this.enabled()&&this.context()===context;
   try{if(valid())await this.run(valid);}catch(error){if(valid())this.onError(error);}finally{this.busy=false;if(!this.stopped)this.timer=this.schedule(()=>this.tick(),this.interval);}
  }
  stop(){this.stopped=true;if(this.timer!==null)this.cancel(this.timer);}
 }
 if(typeof module!=='undefined')module.exports={Poller};else root.NexusPoller=Poller;
})(globalThis);
