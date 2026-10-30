/* Envelope-based downward expansion; one shared detector preserves stereo imaging. */
class TaleditGate extends AudioWorkletProcessor {
  static get parameterDescriptors(){return [['amount',0,0,100],['compression',0,0,100],['threshold',-24,-60,0],['ratio',4,1,20],['attack',10,1,100],['release',200,20,1000]].map(([name,defaultValue,minValue,maxValue])=>({name,defaultValue,minValue,maxValue,automationRate:'k-rate'}));}
  constructor(){super();this.envelope=0;this.gain=1;this.compressorEnvelope=0;}
  process(inputs,outputs,params){
    const input=inputs[0],output=outputs[0],amount=params.amount[0];
    const threshold=10**((-65+amount*.4)/20),ratio=1+amount*.09;
    const attack=Math.exp(-1/(sampleRate*.005)),release=Math.exp(-1/(sampleRate*.1));
    const compThreshold=10**(params.threshold[0]/20),compRatio=1+(params.ratio[0]-1)*params.compression[0]/100;
    const compAttack=Math.exp(-1/(sampleRate*params.attack[0]/1000)),compRelease=Math.exp(-1/(sampleRate*params.release[0]/1000));
    for(let i=0;i<(output[0]?.length||0);i++){
      let peak=0;for(const channel of input)peak=Math.max(peak,Math.abs(channel[i]||0));
      const c=peak>this.envelope?attack:release;this.envelope=c*this.envelope+(1-c)*peak;
      const target=!amount?1:Math.max(.01,Math.min(1,(this.envelope/threshold)**(ratio-1)));
      const g=target>this.gain?attack:release;this.gain=g*this.gain+(1-g)*target;
      const signal=peak*this.gain,coefficient=signal>this.compressorEnvelope?compAttack:compRelease;
      this.compressorEnvelope=coefficient*this.compressorEnvelope+(1-coefficient)*signal;
      const compression=this.compressorEnvelope>compThreshold?(this.compressorEnvelope/compThreshold)**(1/compRatio-1):1;
      for(let ch=0;ch<output.length;ch++)output[ch][i]=(input[ch]?.[i]||0)*this.gain*compression;
    }
    return true;
  }
}
registerProcessor('taledit-gate',TaleditGate);
