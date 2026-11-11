"""왜뜬겨? 쇼츠 만들기
사용법: python3 tools/make_shorts.py shorts.json
shorts.json = {
  "date": "YYYY-MM-DD", "keyword": "김부선", "volume": "2만+", "is_person": true,
  "choices": ["…","…","…","…"], "answer": 2,
  "shown": ["키워드1","키워드2","키워드3"],   # 마지막 화면에 공개할 나머지 키워드 3개 (1개는 숨김)
  "event": true,                              # true면 '주간 1위 커피 쿠폰' 칸, false면 '순위표 1등 도전' 문구
  "out": "출력 mp4 경로"
}
필요한 것: Pillow, ffmpeg, node + playwright(소리 만들기), Noto Sans CJK 글꼴.
"""
import subprocess, os, math, sys, json, tempfile
from PIL import Image, ImageDraw, ImageFont
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
C = json.load(open(sys.argv[1]))
W, H, FPS, DUR = 1080, 1920, 30, 23.0
FB = '/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc'
FR = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
def F(s, bold=False): return ImageFont.truetype(FR if bold else FB, s, index=1)
BG=(14,14,18); PANEL=(26,26,33); PANEL2=(36,36,45); FG=(244,244,246); MUTED=(163,163,176)
YEL=(255,206,0); INK=(20,20,20); GREEN=(47,210,122); RED=(255,75,75)

KW, VOL = C['keyword'], '검색 ' + C['volume']
IS_PERSON = bool(C.get('is_person'))
CHOICES = C['choices']; ANS = int(C['answer'])
SHOWN = C['shown'][:3]
EVENT = bool(C.get('event', True))
_, mm, dd_ = C['date'].split('-'); DATE = f'{int(mm)}월 {int(dd_)}일'
EXPLAIN = None
T_REV = 14.5
T_OUT = 16.5
T_TIMER0, T_TIMER1, T_URG = 5.0, 13.0, 10.0

def ease(x): x=max(0,min(1,x)); return 1-(1-x)**3
def pop(t, t0, d=0.35):
    x=(t-t0)/d
    if x<=0: return 0.0
    if x>=1: return 1.0
    return 1+0.18*math.sin(math.pi*x)*(1-x)*3 if x>0.5 else ease(x*1.6)

def ctext(d, y, s, f, fill, x=W/2): d.text((x,y), s, font=f, fill=fill, anchor='mm')
def wrap(d, s, f, maxw):
    out=[]; cur=''
    for w in s.split(' '):
        t=(cur+' '+w).strip()
        if d.textlength(t,font=f)<=maxw: cur=t
        else: out.append(cur); cur=w
    out.append(cur); return out

def scaled(layer_fn, scale, alpha=1.0):
    """draw a layer on transparent canvas, scale around center, return RGBA"""
    L=Image.new('RGBA',(W,H),(0,0,0,0)); layer_fn(ImageDraw.Draw(L))
    if scale<=0.01 or alpha<=0.01: return None
    if abs(scale-1)>0.005:
        sw,sh=int(W*scale),int(H*scale); L2=L.resize((sw,sh),Image.BILINEAR)
        L=Image.new('RGBA',(W,H),(0,0,0,0)); L.paste(L2,((W-sw)//2,(H-sh)//2))
    if alpha<1: L.putalpha(L.getchannel('A').point(lambda a:int(a*alpha)))
    return L

CX = 510   # 오른쪽 유튜브 버튼(좋아요·댓글)을 피해 가운데를 살짝 왼쪽으로
def badge(d, y=170):
    f=F(64); s='왜뜬겨?'; tw=d.textlength(s,font=f)
    d.rounded_rectangle((CX-tw/2-48,y-56,CX+tw/2+48,y+56),radius=56,fill=YEL)
    ctext(d,y-4,s,f,INK,x=CX)

def cup(d, cx, cy, s=1.0, col=INK):
    w,h=int(120*s),int(110*s)
    d.rounded_rectangle((cx-w//2,cy-h//2,cx+w//2,cy+h//2),radius=int(22*s),fill=col)
    d.arc((cx+w//2-int(22*s),cy-int(30*s),cx+w//2+int(38*s),cy+int(30*s)),-90,90,fill=col,width=max(2,int(14*s)))
    d.rounded_rectangle((cx-w//2-int(18*s),cy+h//2+int(4*s),cx+w//2+int(18*s),cy+h//2+int(18*s)),radius=max(1,int(7*s)),fill=col)

def ribbon(d, y=236):
    # 첫 화면부터 보이는 '주간 1위 커피 쿠폰' 띠 (event가 true일 때)
    f=F(40); s='주간 1위 커피 쿠폰 선물'; tw=d.textlength(s,font=f)
    total=88+tw; x0=CX-total/2-40; x1=CX+total/2+40
    d.rounded_rectangle((x0,y-38,x1,y+38),radius=38,fill=(52,44,10),outline=YEL,width=4)
    cup(d,int(x0+40+24),y+2,0.42,YEL)
    d.text((x0+40+88,y-3),s,font=f,fill=YEL,anchor='lm')

def frame(t):
    im=Image.new('RGBA',(W,H),BG+(255,)); d=ImageDraw.Draw(im)
    if EVENT and t<T_OUT:
        badge(d,118); ribbon(d)
    else:
        badge(d,150)
    def comp(layer):
        if layer is not None: im.alpha_composite(layer)
    if T_TIMER1<=t<T_REV:
        def rv(dd):
            ctext(dd,760,'정답은…',F(120),FG)
            ctext(dd,1010,'?',F(360),YEL)
        comp(scaled(rv, pop(t,T_TIMER1,0.4)))
    elif t<T_OUT:
        if t>=T_REV: t = t-(T_REV-T_TIMER1)   # 정답 공개 화면은 퀴즈 화면을 이어서 그려요
        # keyword card
        def kw(dd):
            dd.rounded_rectangle((70,295,950,595),radius=40,fill=PANEL)
            ctext(dd,345,DATE+' · 오늘 자주 볼 키워드',F(38,True),MUTED,x=CX)
            ctext(dd,445,KW,F(130),YEL,x=CX)
            ctext(dd,548,VOL,F(38,True),MUTED,x=CX)
        comp(scaled(kw, pop(t,0.15,0.45)))
        # question
        if t>=2.3:
            def qq(dd): ctext(dd,668,'왜 떴게?' if IS_PERSON else '이거 왜 떴게?',F(88),FG,x=CX)
            comp(scaled(qq, pop(t,2.3,0.4)))
        # timer bar
        if t>=T_TIMER1:
            def vd(dd): ctext(dd,778,'정답은 '+'ABCD'[ANS]+'!',F(76),GREEN,x=CX)
            comp(scaled(vd, 0.85+0.15*ease((t-T_TIMER1)/0.35), ease((t-T_TIMER1)/0.25)))
        elif t>=T_TIMER0-0.3:
            left=max(0,min(1,1-(t-T_TIMER0)/(T_TIMER1-T_TIMER0)))
            d.rounded_rectangle((70,742,950,762),radius=10,fill=PANEL2)
            col=RED if t>=T_URG else YEL
            if left>0: d.rounded_rectangle((70,742,70+880*left,762),radius=10,fill=col)
            sec=math.ceil((T_TIMER1-t)) if t<T_TIMER1 else 0
            if t>=T_TIMER0: ctext(d,800,f'{min(8,sec)}초',F(42),col,x=CX)
        # choices
        Y0=845; y=Y0
        for k,c in enumerate(CHOICES):
            t0=4.4+0.55*k
            f=F(40,True); lines=wrap(d,c,f,680); h=38+50*len(lines)
            yy=y
            collapse = ease((t-T_TIMER1-0.5)/0.4) if t>=T_TIMER1+0.5 else 0.0
            if k==ANS and collapse>0: yy = int(y + (Y0 - y)*collapse)
            if k!=ANS and t>=T_TIMER1+0.5: y+=h+16; continue
            if t>=t0:
                a=ease((t-t0)/0.3); dx=int((1-a)*120)
                L=Image.new('RGBA',(W,H),(0,0,0,0)); dd=ImageDraw.Draw(L)
                rev = t>=T_TIMER1; right = k==ANS
                fillc = (24,62,44) if (rev and right) else PANEL2
                dd.rounded_rectangle((60+dx,yy,940+dx,yy+h),radius=24,fill=fillc,outline=GREEN if (rev and right) else None,width=6)
                tc = FG if (not rev or right) else (95,95,105)
                dd.text((100+dx,yy+h/2),'ABCD'[k],font=F(46),fill=(GREEN if right else (95,95,105)) if rev else YEL,anchor='lm')
                for j,ln in enumerate(lines): dd.text((160+dx,yy+19+25+50*j),ln,font=f,fill=tc,anchor='lm')
                if a<1: L.putalpha(L.getchannel('A').point(lambda v,a=a:int(v*a)))
                im.alpha_composite(L)
            if k==ANS: ansbottom = yy+h
            y+=h+16
        if EXPLAIN and t>=T_TIMER1+1.0:
            a=ease((t-T_TIMER1-1.0)/0.35)
            L=Image.new('RGBA',(W,H),(0,0,0,0)); dd=ImageDraw.Draw(L)
            top=ansbottom+30
            dd.rounded_rectangle((80,top,1000,top+60+62*len(EXPLAIN)+50),radius=22,fill=PANEL)
            dd.rectangle((80,top,92,top+60+62*len(EXPLAIN)+50),fill=YEL)
            for j,ln in enumerate(EXPLAIN): dd.text((130,top+50+62*j),ln,font=F(44,True),fill=FG,anchor='lm')
            dd.text((130,top+50+62*len(EXPLAIN)+10),SRC,font=F(30,True),fill=MUTED,anchor='lm')
            if a<1: L.putalpha(L.getchannel('A').point(lambda v,a=a:int(v*a)))
            im.alpha_composite(L)
        if 11.0<=t<T_TIMER1:
            pulse=0.5+0.5*math.sin((t-11)*2*math.pi*2)
            ctext(d,1432,'정답을 골라 보세요!',F(42),tuple(int(FG[i]*(0.6+0.4*pulse)) for i in range(3)))
    else:
        def out(dd):
            ctext(dd,310,'오늘의 이슈 키워드,',F(70),FG,x=CX)
            ctext(dd,400,'왜 떴는지 궁금하다면?',F(70),FG,x=CX)
            ctext(dd,505,'왜뜬겨? 퀴즈 풀어 보세요!',F(66),YEL,x=CX)
            dd.rounded_rectangle((70,575,950,995),radius=36,fill=PANEL)
            ctext(dd,635,'나머지 4문제 키워드는?',F(46),FG,x=CX)
            for k,w in enumerate(SHOWN):
                ctext(dd,720+k*75,w,F(50,True),YEL,x=CX)
            ctext(dd,720+3*75,'???  (퀴즈에서 공개!)',F(44,True),MUTED,x=CX)
            if EVENT:
                dd.rounded_rectangle((70,1025,950,1225),radius=32,fill=(52,44,10),outline=YEL,width=5)
                ctext(dd,1080,'퀴즈 풀고 주간 성적 1위에게',F(46,True),FG,x=CX)
                ctext(dd,1162,'커피 쿠폰 선물!',F(76),YEL,x=CX)
                ctext(dd,1262,'참여 방법·규칙은 퀴즈 사이트에서',F(34,True),MUTED,x=CX)
            else:
                ctext(dd,1090,'15초 안에 맞히고',F(52,True),FG,x=CX)
                ctext(dd,1165,'순위표 1등 도전!',F(52,True),FG,x=CX)
            dd.rounded_rectangle((90,1305,930,1425),radius=60,fill=YEL)
            ctext(dd,1363,'아래 영상 버튼 누르고 → 퀴즈 풀기',F(48),INK,x=CX)
        comp(scaled(out, 0.9+0.1*ease((t-T_OUT)/0.45), ease((t-T_OUT)/0.3)))
    return im.convert('RGB')


# 소리: 사이트의 sound.js(째깍·멜로디·띵동)를 그대로 써서 만들어요
tmp = tempfile.mkdtemp()
wav = os.path.join(tmp, 'sound.wav')
subprocess.run(['node', os.path.join(ROOT, 'tools', 'shorts_audio.js'), os.path.join(ROOT, 'sound.js'), wav], check=True)
OUT = C['out']
p=subprocess.Popen(['ffmpeg','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-',
  '-i',wav,'-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-shortest',OUT],stdin=subprocess.PIPE)
for n in range(int(DUR*FPS)):
    p.stdin.write(frame(n/FPS).tobytes())
p.stdin.close(); p.wait()
# 확인용 장면 6장을 한 장으로
shots=[frame(t).resize((360,640)) for t in [7.0,13.8,14.7,15.6,16.9,21]]
sheet=Image.new('RGB',(370*6,640),'white')
for i,im in enumerate(shots): sheet.paste(im,(i*370,0))
sheet.save(os.path.splitext(OUT)[0]+'_check.png')
print('done', OUT)
