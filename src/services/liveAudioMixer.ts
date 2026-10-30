import {audioSettings,roomTaps,type AudioSettings} from './audioMixer';
/** Persistent per-track buses, then master. Media sources are created only once. */
class Bus {
  input:GainNode;output:GainNode;analyser:AnalyserNode;
  private nodes:AudioNode[]=[];private signature='';
  constructor(private ctx:AudioContext){this.input=ctx.createGain();this.input.channelCount=2;this.input.channelCountMode='explicit';this.output=ctx.createGain();this.analyser=ctx.createAnalyser();this.analyser.fftSize=1024;this.output.connect(this.analyser);}
  configure(raw:AudioSettings|undefined,gateReady:boolean){
    const s=audioSettings(raw),signature=JSON.stringify([s,gateReady,raw?.mute]);if(signature===this.signature)return;this.signature=signature;
    this.input.disconnect();for(const n of this.nodes)n.disconnect();this.nodes=[];let tail:AudioNode=this.input;
    const add=(n:AudioNode)=>{tail.connect(n);tail=n;this.nodes.push(n);};
    for(const [type,freq,gain,q] of [['highpass',s.highpass,0,.7071],['lowpass',s.lowpass,0,.7071],['lowshelf',200,s.bass,1],['peaking',1000,s.mid,1],['highshelf',4000,s.treble,1]] as const){
      if((type==='highpass'&&s.highpass===20)||(type==='lowpass'&&s.lowpass===20000)||(['lowshelf','peaking','highshelf'].includes(type)&&gain===0))continue;
      const f=this.ctx.createBiquadFilter();f.type=type;f.frequency.value=freq;f.gain.value=gain;f.Q.value=q;add(f);
    }
    if((s.noise||s.compression)&&gateReady){const gate=new AudioWorkletNode(this.ctx,'taledit-gate',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],parameterData:{amount:s.noise,compression:s.compression,threshold:s.threshold,ratio:s.ratio,attack:s.attack,release:s.release}});add(gate);}
    if(s.width!==100 || s.pan){
      const splitter=this.ctx.createChannelSplitter(2),merger=this.ctx.createChannelMerger(2);tail.connect(splitter);this.nodes.push(splitter,merger);
      const w=s.width/100,angle=(s.pan+100)/200*Math.PI/2,pan=[Math.cos(angle)*Math.SQRT2,Math.sin(angle)*Math.SQRT2];
      for(let out=0;out<2;out++)for(let ch=0;ch<2;ch++){const gain=this.ctx.createGain();gain.gain.value=(out===ch?(1+w)/2:(1-w)/2)*pan[out];splitter.connect(gain,ch);gain.connect(merger,0,out);this.nodes.push(gain);}tail=merger;
    }
    const taps=roomTaps(s);if(taps.length){const sum=this.ctx.createGain();tail.connect(sum);this.nodes.push(sum);for(const tap of taps){const d=this.ctx.createDelay(2),g=this.ctx.createGain();d.delayTime.value=tap.ms/1000;g.gain.value=tap.gain;tail.connect(d);d.connect(g);g.connect(sum);this.nodes.push(d,g);}tail=sum;}
    if(s.delay){const d=this.ctx.createDelay(2);d.delayTime.value=s.delay/1000;add(d);}
    const volume=this.ctx.createGain();volume.gain.value=raw?.mute||s.volume<=-60?0:10**(s.volume/20);add(volume);tail.connect(this.output);
  }
  dispose(){this.input.disconnect();this.output.disconnect();this.analyser.disconnect();this.nodes.forEach(n=>n.disconnect());}
}
export class LiveAudioMixer {
  private buses=new Map<string,Bus>();private master:Bus;private playing:GainNode;private gateReady=false;
  constructor(private ctx:AudioContext){
    this.master=new Bus(ctx);this.playing=ctx.createGain();const limiter=ctx.createWaveShaper();const curve=new Float32Array(4097);for(let i=0;i<curve.length;i++)curve[i]=Math.max(-.95,Math.min(.95,i/(curve.length-1)*2-1));limiter.curve=curve;
    this.master.output.connect(limiter);limiter.connect(this.playing);this.playing.connect(ctx.destination);
    void ctx.audioWorklet.addModule('/audio-gate.js').then(()=>{this.gateReady=true;}).catch(error=>console.error('Riduzione rumore audio non disponibile',error));
  }
  private bus(id:string){let b=this.buses.get(id);if(!b){b=new Bus(this.ctx);b.output.connect(this.master.input);this.buses.set(id,b);}return b;}
  input(id:string){return this.bus(id).input;}
  configure(tracks:{id:string;audio?:AudioSettings;isMuted?:boolean;isSolo?:boolean}[],master:AudioSettings|undefined,playing:boolean,muted:boolean){
    this.master.configure(master,this.gateReady);this.playing.gain.value=playing&&!muted?1:0;
    const solo=tracks.some(t=>t.isSolo);
    for(const track of tracks){const bus=this.bus(track.id);bus.configure(track.audio,this.gateReady);bus.output.gain.value=track.isMuted||(solo&&!track.isSolo)?0:1;}
    for(const [id,b] of this.buses)if(!tracks.some(t=>t.id===id)){b.dispose();this.buses.delete(id);}
  }
  level(id:string){const b=id==='master'?this.master:this.buses.get(id);if(!b)return {peak:0,rms:0};const data=new Float32Array(b.analyser.fftSize);b.analyser.getFloatTimeDomainData(data);let peak=0,sum=0;for(const n of data){peak=Math.max(peak,Math.abs(n));sum+=n*n;}return {peak,rms:Math.sqrt(sum/data.length)};}
}
