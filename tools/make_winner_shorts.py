"""왜뜬겨? 주간 1위 발표 쇼츠 만들기
사용법: python3 tools/make_winner_shorts.py winner.json
winner.json = {
  "week": "11월 9일~15일",                     # 지난주 기간 (화면에 그대로)
  "ranks": [                                   # 1위부터 최대 5명 (사용자가 확정한 순서)
    {"nick": "설입고수", "tag": "A1B2", "score": 5230},
    ...
  ],
  "deadline": "수요일 밤 12시",                 # 연락 기한 (화면에 그대로)
  "out": "출력 mp4 경로"
}
화면 순서(20초): 0~3초 "지난주 1위는…?" → 3~10초 5위~2위 → 10~15초 1위 발표 → 15~20초 연락 안내·이번 주 도전
#태그는 앞 2자리만 보여 줘요(예: #A1**). 쿠폰 바코드·번호는 화면에 넣지 않아요.
필요한 것: Pillow, numpy, ffmpeg, Noto Sans CJK 글꼴.
"""
import subprocess, os, math, sys, json, tempfile, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont

C = json.load(open(sys.argv[1]))
W, H, FPS, DUR = 1080, 1920, 30, 20.0
FB = '/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc'
FR = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
def F(s, bold=False): return ImageFont.truetype(FR if bold else FB, s, index=1)
BG=(14,14,18); PANEL=(26,26,33); PANEL2=(36,36,45); FG=(244,244,246); MUTED=(163,163,176)
YEL=(255,206,0); INK=(20,20,20); GREEN=(47,210,122); GOLD=(255,214,90)

RANKS = C['ranks'][:5]
WEEK = C['week']; DEADLINE = C.get('deadline', '수요일 밤 12시')
def mask(tag): tag=str(tag).upper(); return '#' + tag[:2] + '*' * max(0, len(tag) - 2)
def fmt(n): return f'{int(n):,}점'

T_RUN0, T_WIN, T_OUT = 3.0, 10.0, 15.0
CX = 510   # 오른쪽 유튜브 버튼을 피해 가운데를 살짝 왼쪽으로

def ease(x): x=max(0,min(1,x)); return 1-(1-x)**3
def pop(t, t0, d=0.35):
    x=(t-t0)/d
    if x<=0: return 0.0
    if x>=1: return 1.0
    return 1+0.18*math.sin(math.pi*x)*(1-x)*3 if x>0.5 else ease(x*1.6)
def ctext(d, y, s, f, fill, x=CX): d.text((x,y), s, font=f, fill=fill, anchor='mm')
def fit(d, s, size, maxw, bold=False):
    while size > 30 and d.textlength(s, font=F(size, bold)) > maxw: size -= 2
    return F(size, bold)

def scaled(layer_fn, scale, alpha=1.0):
    L=Image.new('RGBA',(W,H),(0,0,0,0)); layer_fn(ImageDraw.Draw(L))
    if scale<=0.01 or alpha<=0.01: return None
    if abs(scale-1)>0.005:
        sw,sh=int(W*scale),int(H*scale); L2=L.resize((sw,sh),Image.BILINEAR)
        L=Image.new('RGBA',(W,H),(0,0,0,0)); L.paste(L2,((W-sw)//2,(H-sh)//2))
    if alpha<1: L.putalpha(L.getchannel('A').point(lambda a:int(a*alpha)))
    return L

def badge(d, y=150):
    f=F(64); s='왜뜬겨?'; tw=d.textlength(s,font=f)
    d.rounded_rectangle((CX-tw/2-48,y-56,CX+tw/2+48,y+56),radius=56,fill=YEL)
    ctext(d,y-4,s,f,INK)

def cup(d, cx, cy, s=1.0, col=INK):
    w,h=int(120*s),int(110*s)
    d.rounded_rectangle((cx-w//2,cy-h//2,cx+w//2,cy+h//2),radius=int(22*s),fill=col)
    d.arc((cx+w//2-int(22*s),cy-int(30*s),cx+w//2+int(38*s),cy+int(30*s)),-90,90,fill=col,width=max(2,int(14*s)))
    d.rounded_rectangle((cx-w//2-int(18*s),cy+h//2+int(4*s),cx+w//2+int(18*s),cy+h//2+int(18*s)),radius=max(1,int(7*s)),fill=col)
    for k in (-1,0,1):   # 김
        x=cx+k*int(30*s); d.arc((x-int(12*s),cy-h//2-int(70*s),x+int(12*s),cy-h//2-int(10*s)),100,260,fill=col,width=max(2,int(7*s)))

CONF_COLS=[YEL,GREEN,(255,110,110),(110,170,255),(255,160,60)]
rng=np.random.default_rng(7)
CONF=[(rng.uniform(60,1000),rng.uniform(-400,-40),rng.uniform(180,420),rng.uniform(-60,60),rng.integers(0,5),rng.uniform(0,6.28)) for _ in range(90)]
def confetti(d, t):
    for x0,y0,vy,vx,c,ph in CONF:
        y=y0+vy*t; x=x0+vx*t+18*math.sin(t*3+ph)
        if -40<y<H+40:
            s=10+6*abs(math.sin(t*4+ph)); d.rectangle((x,y,x+s,y+18),fill=CONF_COLS[c])

def row(dd, y, rank, r, big=False):
    h = 118
    dd.rounded_rectangle((70,y,950,y+h),radius=30,fill=PANEL2)
    dd.text((120,y+h/2),f'{rank}위',font=F(48),fill=MUTED,anchor='lm')
    nm=r['nick']; f=fit(dd,nm,50,380)
    dd.text((250,y+h/2-16),nm,font=f,fill=FG,anchor='lm')
    dd.text((250,y+h/2+30),mask(r['tag']),font=F(30,True),fill=MUTED,anchor='lm')
    dd.text((910,y+h/2),fmt(r['score']),font=F(44),fill=YEL,anchor='rm')

def frame(t):
    im=Image.new('RGBA',(W,H),BG+(255,)); d=ImageDraw.Draw(im)
    badge(d)
    def comp(layer):
        if layer is not None: im.alpha_composite(layer)
    if t < T_RUN0:
        def a(dd):
            ctext(dd,330,WEEK,F(46,True),MUTED)
            ctext(dd,430,'왜뜬겨? 퀴즈',F(80),FG)
            ctext(dd,530,'주간 1위는…?',F(96),YEL)
            cup(dd,CX,900,2.2,YEL)
            ctext(dd,1160,'커피 쿠폰 주인공 발표!',F(56,True),FG)
        comp(scaled(a, pop(t,0.1,0.45)))
    elif t < T_WIN:
        ctext(d,300,WEEK+' 순위',F(56),FG)
        others=list(enumerate(RANKS))[1:][::-1]          # 5위 → 2위
        n=len(others); y0=420
        for i,(k,r) in enumerate(others):
            t0=T_RUN0+0.4+i*1.4
            if t>=t0:
                y=y0+(n-1-i)*140
                a=ease((t-t0)/0.35); dx=int((1-a)*140)
                L=Image.new('RGBA',(W,H),(0,0,0,0)); dd=ImageDraw.Draw(L)
                row(dd, y, k+1, r)
                if dx: L=L.transform(L.size, Image.AFFINE, (1,0,-dx,0,1,0))
                if a<1: L.putalpha(L.getchannel('A').point(lambda v,a=a:int(v*a)))
                im.alpha_composite(L)
        if t>=T_RUN0+0.4+n*1.4:
            pulse=0.5+0.5*math.sin((t)*2*math.pi*2)
            ctext(d,1100,'그리고 1위는…!',F(76),tuple(int(YEL[i]*(0.6+0.4*pulse)) for i in range(3)))
    elif t < T_OUT:
        confetti(d, t-T_WIN)
        r=RANKS[0]
        def w(dd):
            ctext(dd,320,'지난주 1위',F(64),YEL)
            dd.rounded_rectangle((70,400,950,860),radius=44,fill=(52,44,10),outline=YEL,width=6)
            ctext(dd,530,r['nick'],fit(dd,r['nick'],120,800),FG)
            ctext(dd,650,mask(r['tag']),F(48,True),MUTED)
            ctext(dd,770,fmt(r['score']),F(80),YEL)
            ctext(dd,950,'축하해요!',F(96),FG)
            cup(dd,CX,1250,1.6,YEL)
            ctext(dd,1420,'커피 쿠폰을 드려요',F(60),YEL)
        comp(scaled(w, pop(t,T_WIN,0.5)))
    else:
        def o(dd):
            dd.rounded_rectangle((70,280,950,700),radius=36,fill=PANEL)
            ctext(dd,350,'1위 '+RANKS[0]['nick']+' 님!',fit(dd,'1위 '+RANKS[0]['nick']+' 님!',60,800),YEL)
            ctext(dd,440,DEADLINE+'까지',F(50,True),FG)
            ctext(dd,515,'설명란 오픈채팅으로',F(50,True),FG)
            ctext(dd,590,'닉네임 #태그를 보내 주세요',F(50,True),FG)
            ctext(dd,660,'기한이 지나면 2위에게 넘어가요',F(32,True),MUTED)
            ctext(dd,830,'이번 주 1위는',F(70),FG)
            ctext(dd,925,'바로 당신!',F(90),YEL)
            ctext(dd,1040,'오늘부터 다시 0점에서 시작해요',F(40,True),MUTED)
            dd.rounded_rectangle((90,1305,930,1425),radius=60,fill=YEL)
            ctext(dd,1363,'아래 영상 버튼 누르고 → 퀴즈 풀기',F(48),INK)
        comp(scaled(o, 0.9+0.1*ease((t-T_OUT)/0.45), ease((t-T_OUT)/0.3)))
    return im.convert('RGB')

# ---- 소리: 두근두근 드럼 → 등장 '톡' → 드럼롤 → 빵빠레 → 밝은 멜로디 ----
SR=44100
def env(n, a=0.005, r=0.2):
    t=np.arange(n)/SR; return np.minimum(1,t/a)*np.exp(-t/r)
def add(buf, t0, sig):
    i=int(t0*SR); j=min(len(buf), i+len(sig))
    if i<len(buf): buf[i:j]+=sig[:j-i]
def tone(f, dur, vol=0.3, r=0.25, kind='sin'):
    n=int(dur*SR); t=np.arange(n)/SR
    w=np.sin(2*np.pi*f*t) if kind=='sin' else np.sign(np.sin(2*np.pi*f*t))*0.5+0.5*np.sin(2*np.pi*f*t)
    return vol*w*env(n,0.005,r)
def thump(vol=0.6):
    n=int(0.25*SR); t=np.arange(n)/SR; f=110*np.exp(-t*18)+45
    return vol*np.sin(2*np.pi*np.cumsum(f)/SR)*env(n,0.002,0.09)
def snare(vol=0.18, r=0.05):
    n=int(0.12*SR); return vol*rng.uniform(-1,1,n)*env(n,0.001,r)
buf=np.zeros(int(DUR*SR))
for k in range(4):                                   # 0~3초 두근두근
    add(buf,0.2+k*0.75,thump()); add(buf,0.42+k*0.75,thump(0.45))
others=len(RANKS)-1
for i in range(others):                              # 순위 등장 '톡'
    add(buf,T_RUN0+0.4+i*1.4,tone(880,0.25,0.25,0.08)+tone(1320,0.25,0.12,0.06))
t=T_RUN0+0.4+others*1.4                              # 드럼롤 (점점 크게)
while t<T_WIN-0.05:
    v=0.08+0.25*(t-(T_RUN0+0.4+others*1.4))/max(0.5,T_WIN-(T_RUN0+0.4+others*1.4)); add(buf,t,snare(v,0.04)); t+=0.045
C5,E5,G5,C6=523.25,659.25,783.99,1046.5           # 빵빠레
for k,(f,dt,dd) in enumerate([(G5,0,0.14),(G5,0.15,0.14),(G5,0.3,0.14),(C6,0.45,0.9)]):
    add(buf,T_WIN+dt,tone(f,dd+0.3,0.22,dd,'sq')+tone(f/2,dd+0.3,0.12,dd))
add(buf,T_WIN,snare(0.35,0.3)); add(buf,T_WIN,thump(0.8))
mel=[C5,E5,G5,E5, C5,E5,G5,C6, G5,E5,C5,E5, G5,G5,C6,C6]   # 15초~ 밝은 멜로디
for k in range(int((DUR-T_OUT-0.4)/0.3)):
    f=mel[k%len(mel)]; add(buf,T_OUT+0.1+k*0.3,tone(f,0.35,0.13,0.18)+tone(f/2,0.35,0.06,0.2))
    if k%2==0: add(buf,T_OUT+0.1+k*0.3,thump(0.25))
buf=buf/max(1e-6,np.abs(buf).max())*0.85
fade=int(0.6*SR); buf[-fade:]*=np.linspace(1,0,fade)
tmp=tempfile.mkdtemp(); wav=os.path.join(tmp,'sound.wav')
with wave.open(wav,'wb') as wf:
    wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(SR); wf.writeframes((buf*32767).astype(np.int16).tobytes())

OUT=C['out']
p=subprocess.Popen(['ffmpeg','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-',
  '-i',wav,'-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-shortest',OUT],stdin=subprocess.PIPE)
for n in range(int(DUR*FPS)):
    p.stdin.write(frame(n/FPS).tobytes())
p.stdin.close(); p.wait()
shots=[frame(t).resize((360,640)) for t in [1.5,6.0,9.6,12.0,17.5]]
sheet=Image.new('RGB',(370*len(shots),640),'white')
for i,im in enumerate(shots): sheet.paste(im,(i*370,0))
sheet.save(os.path.splitext(OUT)[0]+'_check.png')
print('done', OUT)
