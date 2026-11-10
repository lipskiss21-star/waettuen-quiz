// 왜뜬겨? 쇼츠 소리 만들기: node tools/shorts_audio.js <sound.js 경로> <출력 wav>
// 0~14.5초 째깍+멜로디(10초부터 빠르게) → 14.5초 띵동 → 16.5초부터 멜로디
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage(); await pg.setContent('<body></body>');
  const src = fs.readFileSync(process.argv[2], 'utf8');
  const b64 = await pg.evaluate(async (src) => {
    const SR = 44100, LEN = 23;
    const off = new OfflineAudioContext(2, SR * LEN, SR); let fake = 0;
    Object.defineProperty(off, 'currentTime', { get: () => fake }); off.resume = () => {}; off.suspend = () => {};
    window.AudioContext = function () { return off; };
    let fn = null; window.setInterval = f => { fn = f; return 1; }; window.clearInterval = () => { fn = null; };
    eval(src); const W = window.WaeSound;
    W.start(); for (fake = 0; fake < 14.48; fake += 0.03) { W.setUrgent(fake >= 10); fn && fn(); }
    fake = 14.48; W.correct();
    fake = 16.5; W.start(); for (; fake < 22.3; fake += 0.03) fn && fn(); W.stop();
    const buf = await off.startRendering();
    const L = buf.getChannelData(0), n = L.length;
    const ab = new ArrayBuffer(44 + n * 2), v = new DataView(ab);
    const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0,'RIFF');v.setUint32(4,36+n*2,true);w(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,SR,true);v.setUint32(28,SR*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,n*2,true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i*2, Math.max(-1, Math.min(1, L[i])) * 32767, true);
    let s=''; const u=new Uint8Array(ab); for (let i=0;i<u.length;i+=0x8000) s+=String.fromCharCode(...u.subarray(i,i+0x8000)); return btoa(s);
  }, src);
  fs.writeFileSync(process.argv[3], Buffer.from(b64, 'base64')); await b.close();
})();
