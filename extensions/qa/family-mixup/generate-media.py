#!/usr/bin/env python3
"""Deterministic Family Mix-Up diagrams and finite observation films.

These original diagrams have exact, testable outcomes; the game clock and advance
remain native Tadazz timeline responsibilities. No generated UI screenshots are
used as gameplay. Run with Python3, Pillow, numpy, ffmpeg and Inkscape installed.
"""
from pathlib import Path
import argparse, hashlib, json, math, subprocess, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT/'packages/web/public/tadazz-show/family-mixup/media'
OUT.mkdir(parents=True, exist_ok=True)
W,H,FPS=1280,720,24
CREAM='#fff8ec'; INK='#17377f'; BLUE='#1745b8'; ORANGE='#f27832'; LILAC='#a99add'; GOLD='#f3cb71'; MUTED='#716f8c'
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

# Inkscape 1.4 drops groups using the SVG2 feDropShadow shorthand.
# The equivalent SVG1.1 primitives preserve both the shadow and SourceGraphic.
def svg(body,w=W,h=H):
 return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><defs><linearGradient id="paper" x2="0" y2="1"><stop stop-color="#fffaf1"/><stop offset="1" stop-color="#eee5e4"/></linearGradient><linearGradient id="blue" x2="0.4" y2="1"><stop stop-color="#4276dd"/><stop offset="1" stop-color="#193c97"/></linearGradient><linearGradient id="orange" x2="0.8" y2="1"><stop stop-color="#ffac60"/><stop offset="1" stop-color="#dd5a21"/></linearGradient><linearGradient id="metal" x2="1" y2="1"><stop stop-color="#fff0bd"/><stop offset=".35" stop-color="#c99437"/><stop offset=".65" stop-color="#f4d58c"/><stop offset="1" stop-color="#a16f22"/></linearGradient><radialGradient id="dark"><stop stop-color="#214c9c"/><stop offset="1" stop-color="#0a1d51"/></radialGradient><filter id="shadow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur in="SourceAlpha" stdDeviation="12" result="blur"/><feOffset in="blur" dx="0" dy="10" result="offsetBlur"/><feFlood flood-color="#17377f" flood-opacity=".13" result="shadowColor"/><feComposite in="shadowColor" in2="offsetBlur" operator="in" result="shadow"/><feMerge><feMergeNode in="shadow"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><rect width="100%" height="100%" fill="url(#paper)"/>{body}</svg>'''

def label(x,y,s,size=34,color=INK,anchor='middle',weight=700):
 return f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-family="DejaVu Sans,sans-serif" font-size="{size}" font-weight="{weight}" fill="{color}">{s}</text>'

def save_svg(name,body,w=W,h=H,transparent=False):
 document=svg(body,w,h)
 if transparent:document=document.replace('<rect width="100%" height="100%" fill="url(#paper)"/>','')
 p=OUT/(name+'.svg');p.write_text(document)
 subprocess.run(['inkscape',str(p),'--export-type=png','--export-filename='+str(OUT/(name+'.png'))],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)

def duck_shape(shadow=False,variant=4):
 # Common geometry makes the correct silhouette mathematically identical.
 def fill(c):return '#1a2851' if shadow else c
 beak='M235 112 Q280 105 291 119 Q271 137 239 130 Z' if variant!=1 else 'M235 112 Q264 108 271 119 Q257 132 239 130 Z'
 hat='M166 57 L176 20 Q207 8 232 30 L235 60 Z' if variant!=2 else 'M166 57 L192 20 Q219 8 244 30 L235 60 Z'
 boot2='M183 262 Q218 260 221 282 L224 305 L258 311 Q274 321 267 337 L184 337 Q177 319 180 294 Z' if variant!=3 else 'M183 262 Q218 260 221 282 L224 305 L242 311 Q255 321 248 337 L184 337 Q177 319 180 294 Z'
 parts=f'<path d="M86 174 L45 143 L52 200 L95 215 Z" fill="{fill("#f2eee5")}"/><ellipse cx="148" cy="207" rx="88" ry="71" fill="{fill("#fff9ed")}"/><path d="M170 193 Q202 175 201 137 Q175 133 180 107 Q181 80 213 77 Q251 79 252 111 Q255 149 229 168 L215 214 Z" fill="{fill("#fff9ed")}"/><path d="{beak}" fill="{fill(ORANGE)}"/><path d="{hat}" fill="{fill("#7762b2")}"/><ellipse cx="205" cy="61" rx="61" ry="11" fill="{fill("#68549e")}"/><path d="M194 31 Q172 2 183 -9 Q213 3 211 34 Z" fill="{fill(GOLD)}"/><path d="M182 150 L232 144 L232 166 L207 169 L222 204 L192 193 L185 167 Z" fill="{fill(ORANGE)}"/><path d="M108 262 Q141 258 146 283 L149 307 L180 313 Q194 324 185 337 L108 337 Q100 317 105 293 Z" fill="{fill(ORANGE)}"/><path d="{boot2}" fill="{fill(ORANGE)}"/>'
 if not shadow:
  parts+='<path d="M95 187 Q135 173 168 188 Q180 208 156 230 Q124 240 106 224" fill="#e7e2d5" stroke="#d4d0c9" stroke-width="3"/><circle cx="225" cy="105" r="6" fill="#172c59"/><circle cx="227" cy="103" r="2" fill="white"/><path d="M175 43 L234 46 L235 57 L169 54 Z" fill="#f1cd71"/><path d="M112 289 L142 291 M186 289 L217 291" stroke="#f8cd77" stroke-width="8"/><path d="M108 333H185 M183 333H266" stroke="#c2552a" stroke-width="8"/>'
 return parts

def small_duck(x,y,scale=1):
 return f'<g transform="translate({x},{y}) scale({scale})"><ellipse cx="25" cy="25" rx="24" ry="16" fill="#efb943"/><circle cx="40" cy="10" r="13" fill="#ffce50"/><path d="M49 9L63 14L49 19Z" fill="#e76e2b"/><circle cx="43" cy="8" r="2.5" fill="#193568"/><path d="M12 24Q25 13 33 27" fill="none" stroke="#d89e31" stroke-width="3"/></g>'

def suitcase(x,y,variant=False):
 handle= '<path d="M-28 -116V-143Q0 -159 28 -143V-116" fill="none" stroke="#193568" stroke-width="12"/>'
 p=f'<g transform="translate({x},{y})"><ellipse cy="147" rx="91" ry="12" fill="#17377f" opacity=".10"/>{handle}<rect x="-85" y="-115" width="170" height="246" rx="28" fill="url(#blue)" stroke="#d9e4ff" stroke-width="4"/><path d="M-52 -90V103 M-17 -90V103 M18 -90V103 M53 -90V103" stroke="#507de0" stroke-width="6"/><rect x="-69" y="124" width="27" height="30" rx="10" fill="#273c70"/><rect x="42" y="124" width="27" height="30" rx="10" fill="#273c70"/><rect x="-81" y="-65" width="12" height="47" rx="6" fill="#e5bf6f"/>'
 p+=f'<rect x="48" y="-77" width="28" height="42" rx="5" fill="{ORANGE if variant else GOLD}"/>'
 return p+'</g>'

# Static diagrams

def validate_cake_boxes_raster(path):
 # A readable label alone is insufficient: all four colored box bodies must exist.
 with Image.open(path) as image:
  if image.size != (W,H):raise RuntimeError('Cake-box diagram has incorrect dimensions')
  pixels=np.asarray(image.convert('RGB'),dtype=np.int16)
 counts=[]
 for i in range(4):
  region=pixels[242:454,100+i*300:320+i*300]
  blue=(region[:,:,2]>region[:,:,0]+40)&(region[:,:,2]>region[:,:,1]+30)
  count=int(np.count_nonzero(blue));counts.append(count)
  if count<10000:raise RuntimeError(f'Cake-box diagram is missing visible geometry for box {chr(65+i)}')
 return counts

def cake_boxes():
 b=''
 for i in range(4):
  x=100+i*300;b+=f'<g filter="url(#shadow)"><rect x="{x}" y="242" width="220" height="212" rx="18" fill="url(#blue)"/><path d="M{x} 275H{x+220} M{x+112} 242V454" stroke="#f4cd79" stroke-width="14"/><rect x="{x+45}" y="319" width="130" height="83" rx="12" fill="#fff8ec"/></g>'+label(x+110,378,chr(65+i),56)
 save_svg('cake-boxes',b)
 validate_cake_boxes_raster(OUT/'cake-boxes.png')

def diagrams():
 save_svg('duck-question',f'<ellipse cx="640" cy="622" rx="205" ry="28" fill="#17377f" opacity=".10"/><g transform="translate(375,115) scale(1.8)">{duck_shape()}</g>')
 for i in range(1,5):save_svg(f'duck-shadow-{i}',f'<g transform="translate(130,50) scale(1.35)">{duck_shape(True,i)}</g>',640,560,transparent=True)
 living='''<rect x="64" y="64" width="1152" height="545" rx="28" fill="#f5eddf" stroke="#e1d3bd" stroke-width="4"/><path d="M64 491H1216" stroke="#d8c4a7" stroke-width="5"/><rect x="103" y="105" width="220" height="241" rx="8" fill="#bdcdea" stroke="white" stroke-width="16"/><path d="M213 105V346M103 223H323" stroke="white" stroke-width="12"/><rect x="807" y="104" width="247" height="301" rx="12" fill="#e0d2ba"/><path d="M815 190H1046M815 280H1046" stroke="#b89e78" stroke-width="14"/><g fill="#1745b8"><rect x="836" y="131" width="25" height="49" rx="3"/><rect x="864" y="125" width="25" height="55" rx="3"/><rect x="944" y="215" width="25" height="55" rx="3"/></g><g fill="#ef8751"><rect x="896" y="130" width="25" height="50" rx="3"/><rect x="1000" y="214" width="25" height="56" rx="3"/></g><rect x="348" y="290" width="415" height="232" rx="55" fill="#a99add"/><rect x="325" y="385" width="461" height="132" rx="32" fill="#9180cc"/><path d="M360 504V560M748 504V560" stroke="#8c623b" stroke-width="18"/><rect x="395" y="316" width="110" height="100" rx="20" fill="#efe2c8"/><rect x="593" y="316" width="115" height="100" rx="20" fill="#e9966a"/><ellipse cx="621" cy="608" rx="357" ry="52" fill="#d6daf0"/><path d="M488 502L465 617M762 502L791 617" stroke="#a57543" stroke-width="18"/><ellipse cx="633" cy="500" rx="184" ry="31" fill="#f8e9ca" stroke="#d8c6a9" stroke-width="6"/><path d="M1114 489V310" stroke="#907c53" stroke-width="8"/><path d="M1114 418Q1041 337 1068 323Q1110 317 1114 418M1114 381Q1180 302 1200 323Q1201 360 1114 381M1114 329Q1083 267 1114 253Q1147 274 1114 329" fill="#6b987a"/><path d="M1066 454H1161L1144 541H1083Z" fill="#df8252"/><path d="M204 484V360" stroke="#bba775" stroke-width="9"/><path d="M150 320H260L280 389H129Z" fill="#efc46e"/><ellipse cx="204" cy="489" rx="50" ry="12" fill="#a99566"/><rect x="432" y="101" width="230" height="130" rx="5" fill="#fff8ec" stroke="#dfba74" stroke-width="10"/><path d="M451 211L518 127L559 181L594 147L641 211Z" fill="#a5b2d9"/>'''
 locations=[(137,282,.62),(280,448,.65),(669,371,.65),(902,229,.65),(958,339,.65),(823,530,.68),(351,560,.65),(522,455,.62),(724,165,.68)]
 save_svg('hidden-ducks',living+''.join(small_duck(*x) for x in locations))
 save_svg('suitcases',''.join(suitcase(185+303*i,340,i==1)+label(185+303*i,586,chr(65+i),40) for i in range(4)))
 # A chiral F pentomino: its mirror is NOT any rotation of the source.
 # A symmetric T would make reflected distractors accidentally correct.
 shape=[(1,0),(3,0),(3,1),(2,1),(2,3),(1,3),(1,2),(0,2),(0,1),(1,1)]
 def poly(points,cx,cy,unit=32,rot=0,flip=False):
  pts=[]
  for x,y in points:
   x-=1.5;y-=1.5
   if flip:x=-x
   for _ in range(rot):x,y=-y,x
   pts.append(f'{cx+x*unit},{cy+y*unit}')
  return '<polygon points="'+' '.join(pts)+'" fill="url(#blue)" stroke="#102e76" stroke-width="3" stroke-linejoin="round"/>'
 b=label(640,64,'ORIGINAL',26,color=MUTED)+poly(shape,640,185,49)
 for i in range(4):
  b+=f'<rect x="{55+i*305}" y="348" width="255" height="280" rx="22" fill="white" stroke="#e0d9d1" stroke-width="2"/>'+poly(shape,182+i*305,470,42,rot=[1,1,3,0][i],flip=i in [1,3]) +label(182+i*305,601,chr(65+i),32)
 # Option C has one extra arm so cannot be a rotation.
 b=b.replace(poly(shape,792,470,42,rot=3,flip=False),poly([(1,0),(3,0),(3,1),(2,1),(2,3),(0,3),(0,1),(1,1)],792,470,42,rot=3))
 save_svg('rotation',b)
 cake_boxes()
 # Explicit routes never intersect, with B alone reaching treasure.
 routes=[[(110,130),(310,130),(310,220),(480,220),(480,120),(830,120),(830,245)],[(110,290),(220,290),(220,390),(390,390),(390,300),(610,300),(610,200),(720,200),(720,360),(1090,360)],[(110,450),(260,450),(260,530),(520,530),(520,430),(640,430),(640,570),(840,570)],[(110,610),(160,610),(160,665),(970,665),(970,500),(1140,500),(1140,590)]]
 b='<rect x="55" y="55" width="1170" height="635" rx="22" fill="#fbf8f0" stroke="#ded8ca" stroke-width="3"/>'
 for i,path in enumerate(routes):
  pts=' '.join(f'{x},{y}' for x,y in path);b+=f'<polyline points="{pts}" fill="none" stroke="#9daed3" stroke-width="32" stroke-linecap="round" stroke-linejoin="round"/><polyline points="{pts}" fill="none" stroke="#173b93" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>'+label(82,path[0][1]+10,chr(65+i),30)
  if i!=1:
   x,y=path[-1];b+=f'<circle cx="{x}" cy="{y}" r="22" fill="#f27832"/>'+label(x,y+10,'×',32,color='white')
 b+='<rect x="1080" y="320" width="100" height="85" rx="12" fill="url(#metal)" stroke="#8f6425" stroke-width="4"/><path d="M1080 350H1180M1110 322V404M1150 322V404" stroke="#715128" stroke-width="7"/><rect x="1115" y="349" width="29" height="30" rx="5" fill="#17377f"/>'
 save_svg('treasure-routes',b)
 def shapeicon(kind,x,y,size=55):
  if kind=='circle':return f'<circle cx="{x}" cy="{y}" r="{size}" fill="{ORANGE}"/>'
  if kind=='triangle':return f'<path d="M{x} {y-size}L{x+size} {y+size}H{x-size}Z" fill="{LILAC}"/>'
  if kind=='square':return f'<rect x="{x-size}" y="{y-size}" width="{size*2}" height="{size*2}" rx="10" fill="{INK}"/>'
  pts=' '.join(f'{x+math.cos(math.pi/5*k-math.pi/2)*(size if k%2==0 else size*.45):.2f},{y+math.sin(math.pi/5*k-math.pi/2)*(size if k%2==0 else size*.45):.2f}' for k in range(10))
  return f'<polygon points="{pts}" fill="{GOLD}"/>'
 b=''.join(shapeicon(k,100+i*154,340,49) for i,k in enumerate(['circle','triangle','circle','square','circle','triangle','circle']))+label(1178,360,'?',91)
 save_svg('shape-pattern',b)
 for k in ['square','triangle','circle','star']:save_svg('shape-'+k,shapeicon(k,260,230,125),520,460)
 # Missing piece D uses the exact hole silhouette; variants invert/omit a tab.
 def piece(kind,x=0,y=0,scale=1,color=BLUE):
  paths={
  'd':'M0 0H55C40 -40 100 -40 85 0H140V55C180 40 180 100 140 85V140H85C100 100 40 100 55 140H0V85C40 100 40 40 0 55Z',
  'a':'M0 0H55C40 -40 100 -40 85 0H140V55C100 40 100 100 140 85V140H85C100 100 40 100 55 140H0V85C40 100 40 40 0 55Z',
  'b':'M0 0H55C40 40 100 40 85 0H140V55C180 40 180 100 140 85V140H85C100 100 40 100 55 140H0V85C40 100 40 40 0 55Z',
  'c':'M0 0H55C40 -40 100 -40 85 0H140V55C180 40 180 100 140 85V140H85C100 180 40 180 55 140H0V85C40 100 40 40 0 55Z'}
  return f'<g transform="translate({x},{y}) scale({scale})"><path d="{paths[kind]}" fill="{color}" stroke="#17377f" stroke-width="3" stroke-linejoin="round"/></g>'
 b='<rect x="385" y="128" width="510" height="465" rx="24" fill="#d4c9e8" stroke="#9d90bd" stroke-width="6"/>'+piece('d',490,242,2.15,CREAM)+label(640,671,'Which piece fits the space?',28,color=MUTED)
 save_svg('missing-piece',b)
 for k in ['a','b','c','d']:save_svg('piece-'+k,piece(k,150,130,1.55),550,510)
 save_svg('rebus-man-overboard',label(640,291,'MAN',113)+label(640,462,'BOARD',113))
 b='<rect x="370" y="90" width="540" height="540" fill="white" stroke="#1745b8" stroke-width="10"/><path d="M550 90V630M730 90V630M370 270H910M370 450H910" fill="none" stroke="#1745b8" stroke-width="7"/>'
 save_svg('square-grid',b)
 # A geometry-only vault image leaves clues and answers live in native UI.
 b='<rect width="1280" height="720" fill="#0a1e4c"/><circle cx="640" cy="350" r="277" fill="url(#metal)"/><circle cx="640" cy="350" r="250" fill="#132b64" stroke="#f2d591" stroke-width="10"/><circle cx="640" cy="350" r="207" fill="url(#dark)" stroke="#9d7a45" stroke-width="8"/>'
 for i in range(12):
  a=2*math.pi*i/12;x=640+230*math.cos(a);y=350+230*math.sin(a);b+=f'<circle cx="{x}" cy="{y}" r="10" fill="#f2d38c"/>'
 b+='<rect x="470" y="250" width="340" height="100" rx="18" fill="#071431" stroke="#d7ba7a" stroke-width="5"/>'+label(640,320,'• • • •',60,color='#f7df9c')
 b+='<circle cx="640" cy="450" r="73" fill="none" stroke="url(#metal)" stroke-width="19"/><path d="M640 377V523M567 450H713M588 398L692 502M692 398L588 502" stroke="url(#metal)" stroke-width="10"/><circle cx="640" cy="450" r="25" fill="url(#metal)"/>'
 save_svg('vault-closed',b)

# Videos: drawing and encoding exact observation events, no baked live controls.
def rgb(hex):return tuple(int(hex[i:i+2],16) for i in [1,3,5])
def font(sz,bold=True):return ImageFont.truetype(BOLD if bold else FONT,sz)
def txt(d,xy,s,size=36,fill=INK,anchor='mm',bold=True):d.text(xy,s,font=font(size,bold),fill=fill,anchor=anchor)
def roundbox(d,box,fill=CREAM,r=22,outline=None,width=2):d.rounded_rectangle(tuple(int(x) for x in box),r,fill=fill,outline=outline,width=width)
def circle(d,xy,r,fill,outline=None,width=1):x,y=xy;d.ellipse((x-r,y-r,x+r,y+r),fill=fill,outline=outline,width=width)
def line(d,points,fill,width=8):d.line(points,fill=fill,width=width,joint='curve')
def ease(t):return (1-math.cos(math.pi*max(0,min(1,t))))/2

def stage():
 arr=np.zeros((H,W,3),np.uint8)
 for y in range(H):
  t=y/(H-1);arr[y,:,:]=np.array([255,249,238])*(1-t)+np.array([229,225,237])*t
 im=Image.fromarray(arr);d=ImageDraw.Draw(im)
 d.ellipse((-280,550,1560,1000),fill='#f8efe2',outline='#dfcc9e',width=4)
 d.arc((-100,-430,1380,630),0,180,fill='#b2a5df',width=16)
 return im
BASE=stage()

def header(im,title,kicker=None):
 d=ImageDraw.Draw(im)
 if kicker:txt(d,(640,63),kicker,24,MUTED)
 txt(d,(640,116),title,45)
 return d

def cup(d,x,y,c=BLUE):
 # y is cup lower edge; stepped highlights suggest a lacquered stage prop.
 d.ellipse((x-87,y-5,x+87,y+20),fill='#d1cada')
 d.polygon([(x-61,y-164),(x+61,y-164),(x+82,y),(x-82,y)],fill=c)
 d.ellipse((x-61,y-181,x+61,y-146),fill='#4e79d1')
 d.arc((x-61,y-181,x+61,y-146),180,360,fill='#90b2ee',width=4)
 d.line([(x-48,y-153),(x-61,y-12)],fill='#5b83da',width=7)
 d.ellipse((x-82,y-12,x+82,y+13),fill='#173786')
 d.arc((x-82,y-12,x+82,y+13),0,180,fill='#e1ba65',width=5)

def cups(t):
 im=BASE.copy();d=header(im,'Follow the golden ball','WATCH CAREFULLY')
 xs=[270,515,760,1005];positions=[0,1,2,3]
 swaps=[(1.6,3.1,0,1),(3.3,4.8,1,3),(5.0,6.5,3,2)]
 motion={}
 for start,end,a,b in swaps:
  ia=positions.index(a);ib=positions.index(b)
  if t>=end:positions[ia],positions[ib]=b,a
  elif start<=t<end:
   q=ease((t-start)/(end-start));motion[ia]=(xs[a]+(xs[b]-xs[a])*q,-65*math.sin(math.pi*q));motion[ib]=(xs[b]+(xs[a]-xs[b])*q,35*math.sin(math.pi*q));break
  else:break
 if t<1.45:
  circle(d,(xs[0],477),21,GOLD,outline='#bd8a31',width=3)
  lift=95 if t<.7 else 95*(1-ease((t-.7)/.75))
 else:lift=0
 for i,pos in enumerate(positions):
  x,dy=motion.get(i,(xs[pos],0));cup(d,x,485+dy-(lift if i==0 else 0))
 for i,x in enumerate(xs):txt(d,(x,563),chr(65+i),40)
 return im

def icon(d,kind,x,y,s=1):
 def p(a,b):return(x+a*s,y+b*s)
 if kind=='umbrella':
  d.pieslice((x-115*s,y-140*s,x+115*s,y+90*s),180,360,fill=BLUE)
  line(d,[p(-115,-25),p(115,-25)],GOLD,max(2,int(7*s)));line(d,[p(0,-25),p(0,125)],INK,max(2,int(11*s)))
  d.arc((x,y+90*s,x+55*s,y+145*s),0,180,fill=INK,width=max(2,int(11*s)))
 elif kind=='banana':
  d.arc((x-145*s,y-140*s,x+140*s,y+130*s),35,160,fill='#f3c54c',width=int(68*s));d.arc((x-140*s,y-145*s,x+145*s,y+125*s),45,155,fill='#ffe58c',width=int(14*s));line(d,[p(-130,0),p(-140,-20)],'#796135',int(12*s))
 elif kind=='clock':
  circle(d,(x,y),115*s,GOLD);circle(d,(x,y),101*s,CREAM)
  for i in range(12):
   a=i*math.pi/6;line(d,[p(math.sin(a)*81,-math.cos(a)*81),p(math.sin(a)*91,-math.cos(a)*91)],INK,int(5*s))
  line(d,[p(0,-67),p(0,0),p(56,32)],INK,int(9*s));circle(d,(x,y),8*s,INK)
 elif kind=='shoe':
  d.polygon([p(-110,-35),p(-32,-15),p(2,-90),p(43,-42),p(52,10),p(115,47),p(125,84),p(-115,84)],fill=ORANGE)
  roundbox(d,(x-119*s,y+65*s,x+131*s,y+94*s),'#f0cf87',r=int(10*s));line(d,[p(-12,-7),p(29,16)],CREAM,int(9*s));line(d,[p(-22,12),p(18,34)],CREAM,int(9*s))
 elif kind=='balloon':
  d.ellipse((x-86*s,y-147*s,x+86*s,y+53*s),fill=LILAC);d.polygon([p(0,48),p(-15,72),p(15,72)],fill='#8c78c8');line(d,[p(0,70),p(14,105),p(-12,150),p(0,185)],'#c1a871',int(4*s));d.arc((x-65*s,y-125*s,x+55*s,y+20*s),185,245,fill='#d9c9ff',width=int(13*s))
 elif kind=='key':
  circle(d,(x-40*s,y-65*s),55*s,GOLD);circle(d,(x-40*s,y-65*s),27*s,CREAM);line(d,[p(-9,-31),p(101,90)],GOLD,int(27*s));line(d,[p(73,60),p(47,86)],GOLD,int(23*s));line(d,[p(98,87),p(73,111)],GOLD,int(23*s))
 elif kind=='glasses':
  for dx in [-52,52]:roundbox(d,(x+(dx-43)*s,y-30*s,x+(dx+43)*s,y+32*s),fill=None,r=int(22*s),outline=INK,width=int(9*s))
  line(d,[p(-9,-7),p(9,-7)],INK,int(9*s));line(d,[p(-96,-12),p(-128,-40)],INK,int(8*s));line(d,[p(96,-12),p(125,-40)],INK,int(8*s))
 elif kind=='biscuit':
  circle(d,(x,y),72*s,'#daaa6e',outline='#bb884c',width=int(5*s))
  for dx,dy in [(-30,-25),(13,-33),(38,0),(12,35),(-36,30),(-5,0)]:circle(d,p(dx,dy),8*s,'#8c5437')
 elif kind=='spoon':
  line(d,[p(-40,75),p(35,-33)],'#9da9bc',int(19*s));d.ellipse((x+12*s,y-99*s,x+91*s,y-10*s),fill='#bcc6d5',outline='#8c9eb7',width=int(4*s))

def sequence(t):
 im=BASE.copy();d=header(im,'Remember the order','WATCH CAREFULLY')
 names=['umbrella','banana','clock','shoe','balloon','key'];idx=min(5,max(0,int((t-.5)/1.08)))
 if t>=.5 and t<7:
  local=(t-.5)%1.08;scale=.98+.035*math.sin(local*math.pi)
  icon(d,names[idx],640,381,scale)
  for i in range(6):circle(d,(550+i*36,621),5,BLUE if i==idx else '#c8c4d3')
 return im

def missing(t):
 im=BASE.copy();d=header(im,'Something is about to disappear','WATCH CAREFULLY')
 d.ellipse((150,230,1130,620),fill='#ece0c7',outline='#cfb88e',width=5)
 for i,k in enumerate(['key','glasses','biscuit','spoon']):
  if not(k=='biscuit' and t>=4):icon(d,k,320+i*210,405,.65)
 if 3.3<t<4:
  roundbox(d,(140,218,1140,633),BLUE,40);txt(d,(640,421),'Keep it in mind…',46,CREAM)
 return im

def breakfast(t):
 im=BASE.copy();d=header(im,'Take in the whole scene','WATCH CAREFULLY')
 d.ellipse((100,240,1180,680),fill='#efe1c5',outline='#cebc99',width=5)
 # toaster, animated toast and steam; coherent deliberately authored objects.
 for x in [884,986]:
  pop=0 if t<2 else 40*math.sin(min(1,(t-2)/1.5)*math.pi/2)
  roundbox(d,(x-37,328-pop,x+37,421-pop),'#c9975f',16,outline='#a87545',width=4)
  roundbox(d,(x-29,336-pop,x+29,402-pop),'#e4bc82',12)
 roundbox(d,(810,365,1060,545),'#f2c346',34,outline='#d9a83b',width=4)
 roundbox(d,(833,524,1041,552),'#c0bcc2',12)
 line(d,[(1026,406),(1026,475)],'#b8a89d',7);roundbox(d,(1015,445,1050,458),INK,6)
 d.ellipse((445,397,714,560),fill='#faf8ec',outline=BLUE,width=5)
 d.arc((485,423,679,520),190,350,fill='#c89050',width=54)
 for a in [218,245,272,299,326]:
  xx=582+77*math.cos(math.radians(a));yy=473+26*math.sin(math.radians(a));line(d,[(xx-8,yy-23),(xx+5,yy+18)],'#efd29a',8)
 # Blueberries and strawberries
 for x,y in [(689,505),(668,530),(708,531)]:circle(d,(x,y),11,'#294879')
 for x,y in [(462,500),(478,529)]:d.polygon([(x-13,y-8),(x+13,y-8),(x,y+22)],fill='#d36156')
 roundbox(d,(262,340,366,470),LILAC,22);d.arc((342,358,403,430),270,90,fill=LILAC,width=16)
 roundbox(d,(414,277,499,392),CREAM,17,outline='#d3c4a5',width=3)
 for yy in [312,340,368]:line(d,[(418,yy),(494,yy)],BLUE,7)
 d.arc((478,292,527,357),270,90,fill='#d3c4a5',width=12)
 for x in [290,327]:
  points=[(x+math.sin(t*2+i*.5)*8,335-i*11) for i in range(7)];line(d,points,'#d4c9d3',4)
 roundbox(d,(568,268,637,366),'#c05248',10);roundbox(d,(563,258,642,282),'#f2e6d8',6)
 for xx in range(570,641,13):line(d,[(xx,259),(xx,281)],ORANGE,5)
 d.ellipse((721,541,809,584),fill=CREAM,outline='#d6c6ad',width=2);roundbox(d,(740,534,787,565),'#efd877',5)
 return im

def car(d,x,y,color=ORANGE,scale=1):
 roundbox(d,(x-54*scale,y-22*scale,x+54*scale,y+20*scale),color,int(12*scale))
 d.polygon([(x-25*scale,y-22*scale),(x-12*scale,y-45*scale),(x+27*scale,y-45*scale),(x+43*scale,y-22*scale)],fill=color)
 d.polygon([(x-8*scale,y-39*scale),(x+22*scale,y-39*scale),(x+33*scale,y-22*scale),(x-18*scale,y-22*scale)],fill='#d8e6f5')
 for dx in [-32,32]:circle(d,(x+dx*scale,y+18*scale),13*scale,'#23355c');circle(d,(x+dx*scale,y+18*scale),5*scale,'#dce0ed')

def interp_path(points,u):
 lens=[math.dist(a,b) for a,b in zip(points,points[1:])];total=sum(lens);dist=max(0,min(1,u))*total
 for a,b,l in zip(points,points[1:],lens):
  if dist<=l:
   q=dist/l;return(a[0]+(b[0]-a[0])*q,a[1]+(b[1]-a[1])*q)
  dist-=l
 return points[-1]

def exit_car(t):
 im=BASE.copy();d=header(im,'Follow the tiny car','WATCH CAREFULLY')
 path=[(135,565),(305,565),(305,280),(530,280),(530,470),(755,470),(755,240),(945,240),(945,540),(1085,540)]
 line(d,path,'#a6b2d2',47);line(d,path,CREAM,32)
 # A small terminal hides the car before it visibly emerges from door D.
 roundbox(d,(1010,177,1178,605),'#d8d0e4',20,outline='#b4a7c9',width=3)
 for i,y in enumerate([230,335,440,545]):
  roundbox(d,(1070,y-42,1180,y+42),BLUE,14);txt(d,(1040,y),chr(65+i),34,INK)
 # cover-like arches along the route add depth, while car traversal remains clear
 for x,y in [(305,380),(650,470),(945,395)]:roundbox(d,(x-34,y-40,x+34,y+40),LILAC,16,outline='#9988cb',width=3)
 if t<5.8:
  x,y=interp_path(path,ease(min(1,t/5.8)))
  if x<1013:car(d,x,y,scale=.72)
 elif t>=6.15:
  x=1090+(1230-1090)*ease((t-6.15)/1.05)
  # The opaque left door edge is the occluder; the car exits to the right.
  car(d,x,545,scale=.72)
  roundbox(d,(1070,503,1180,587),BLUE,5)
 return im

def race_frame(t,reveal=False):
 im=BASE.copy();d=header(im,'Which racer will cross first?' if not reveal else 'The finish','MAKE YOUR PREDICTION' if not reveal else 'THE RESULT')
 colors=[BLUE,ORANGE,LILAC,'#e8bb4e']
 for i in range(4):
  y=261+i*90;roundbox(d,(90,y-32,1190,y+35),'#f8f3e9',18,outline='#d8d5e0',width=2);txt(d,(117,y),chr(65+i),28)
 for y in range(225,607,22):
  for x in [1098,1120]:
   if (int((y-225)/22)+(x-1098)//22)%2==0:d.rectangle((x,y,x+21,y+21),fill=INK)
 starts=[177,177,177,177];freeze=[850,824,870,808]
 if reveal:
  # C crosses t=.95, A t=1.50, B t=1.75, D t=2.10.
  timings=[1.50,1.75,.95,2.10];positions=[freeze[i]+(1137-freeze[i])*min(t/timings[i],1.13) for i in range(4)]
 else:
  u=ease(min(1,t/5.3));positions=[starts[i]+(freeze[i]-starts[i])*u for i in range(4)]
 for i,x in enumerate(positions):car(d,x,261+i*90,colors[i],.62)
 if not reveal and t>=5.3:
  roundbox(d,(493,620,787,680),BLUE,28);txt(d,(640,650),'What happens next?',25,CREAM)
 if reveal and t>1.5:
  roundbox(d,(460,620,820,680),BLUE,28);txt(d,(640,650),'RACER C WINS',28,CREAM)
 return im

def whisk(d,x,y,scale=1):
 # Handle and wire loops drawn as one reproducible kitchen object.
 line(d,[(x,y+25*scale),(x,y+203*scale)],'#e57b35',int(33*scale));circle(d,(x,y+203*scale),16*scale,'#be6028')
 for spread in [38,65,90]:
  points=[]
  for i in range(81):
   a=2*math.pi*i/80;xx=x+spread*scale*math.sin(a);yy=y-90*scale-130*scale*math.cos(a);points.append((xx,yy))
  line(d,points,'#879ab6',max(2,int(5*scale)))
 line(d,[(x,y-219*scale),(x,y+40*scale)],'#b4c3d6',max(2,int(5*scale)))

def whisk_observe(t,reveal=False):
 im=BASE.copy();d=header(im,'A familiar object. A different view.','MYSTERY OBJECT' if not reveal else 'THE REVEAL')
 if reveal:
  scale=1.0;whisk(d,640,370,scale);txt(d,(640,653),'A kitchen whisk',35)
 else:
  # Starts close and exposes distinctive loops while withholding handle.
  scale=2.1-.35*ease(t/7);whisk(d,640,740,scale)
 return im

CLIPS={'cups-observe':(8,cups),'breakfast-observe':(8,breakfast),'objects-observe':(8,sequence),'biscuit-observe':(8,missing),'car-observe':(8,exit_car),'race-observe':(7,lambda t:race_frame(t,False)),'race-reveal':(4,lambda t:race_frame(t,True)),'whisk-observe':(8,lambda t:whisk_observe(t,False)),'whisk-reveal':(3,lambda t:whisk_observe(t,True))}

def video(name,duration,fn):
 path=OUT/(name+'.mp4')
 if name=='breakfast-observe':
  # Hold the approved photograph for the observation interval. Encoding a
  # finite video preserves native onMediaEnd ownership and exact media timing.
  source=OUT/'breakfast.png'
  if not source.exists():raise FileNotFoundError('The approved breakfast.png is required')
  subprocess.run(['ffmpeg','-y','-loglevel','error','-loop','1','-i',str(source),'-t',str(duration),'-r',str(FPS),'-vf',f'scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=0xfff8ec','-an','-c:v','libx264','-preset','fast','-crf','22','-pix_fmt','yuv420p','-movflags','+faststart',str(path)],check=True)
  subprocess.run(['ffmpeg','-y','-loglevel','error','-ss','1','-i',str(path),'-frames:v','1',str(OUT/(name+'-poster.png'))],check=True)
  print('encoded',name,duration,'approved photograph',flush=True)
  return
 p=subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','rawvideo','-vcodec','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-an','-c:v','libx264','-preset','fast','-crf','22','-pix_fmt','yuv420p','-movflags','+faststart',str(path)],stdin=subprocess.PIPE)
 for n in range(round(duration*FPS)):p.stdin.write(fn(n/FPS).convert('RGB').tobytes())
 p.stdin.close()
 if p.wait()!=0:raise RuntimeError(name+' ffmpeg failed')
 fn(min(duration-.05,4)).save(OUT/(name+'-poster.png'))
 print('encoded',name,duration,flush=True)

FACTS={
 'cups-observe':{'seconds':8,'correctPosition':'C','swaps':[['A','B'],['B','D'],['D','C']],'labels':'fixed final positions'},
 'breakfast-observe':{'seconds':8,'toasterColor':'Yellow','source':'breakfast.png','presentation':'Approved photographic scene held for eight seconds'},
 'objects-observe':{'seconds':8,'sequence':['Umbrella','Banana','Clock','Shoe','Balloon','Key'],'afterBanana':'Clock'},
 'biscuit-observe':{'seconds':8,'before':['Keys','Glasses','Biscuit','Spoon'],'after':['Keys','Glasses','Spoon']},
 'car-observe':{'seconds':8,'exitDoor':'D'},
 'race-observe':{'seconds':7,'endsBeforeFinish':True},
 'race-reveal':{'seconds':4,'winner':'C','finishOrder':['C','A','B','D']},
 'whisk-observe':{'seconds':8,'object':'Kitchen whisk'},
 'whisk-reveal':{'seconds':3,'object':'Kitchen whisk'},
 'duck-question':{'usage':'Legacy deterministic source, unused by final Q6'},
 'duck':{'correctShadow':4,'sharedGeometry':'The same approved alpha image is the question and option 4; runtime CSS brightness(0) creates its exact silhouette.'},
 'hidden-ducks':{'count':9},'suitcases':{'different':'B','difference':'orange luggage tag rather than gold'},
 'rotation':{'correct':'A','transformation':'90 degree rotation of chiral F pentomino; B and D mirrored; C adds a sixth square'},'cake-boxes':{'leftToRight':['A','B','C','D'],'correct':'D'},
 'treasure-routes':{'correct':'B'},'shape-pattern':{'sequence':['circle','triangle','circle','square','circle','triangle','circle'],'next':'square'},
 'missing-piece':{'correct':'D','sharedGeometry':'piece d exact matching hole'},'rebus-man-overboard':{'answer':'Man overboard'},'square-grid':{'grid':[3,3],'squares':14,'sizes':{'1x1':9,'2x2':4,'3x3':1}},'vault-closed':{'solution':'3624','clues':['triangle sides','twice first','one less than first','second minus third']},
 'toothbrush-macro':{'object':'Manual toothbrush bristles','reveal':'toothbrush-full.png'},
 'toothbrush-full':{'object':'Manual toothbrush','matches':'Blue-white-purple bristles in the macro'},
 'breakfast':{'toasterColor':'Yellow','usage':'Approved photographic source of breakfast-observe.mp4'},
 'penguin':{'subject':'Penguin'},'octopus':{'subject':'Octopus'},'fox':{'subject':'Fox'},'elephant':{'subject':'Elephant'},
 'rabbit':{'subject':'Rabbit'},'wombat':{'subject':'Wombat'},'kangaroo':{'subject':'Kangaroo'},'polar-bear':{'subject':'Polar bear'}}

RASTER_SUBJECTS={'duck','penguin','octopus','fox','elephant','rabbit','wombat','kangaroo','polar-bear','breakfast','toothbrush-macro','toothbrush-full'}

def manifest():
 assets=[]
 for p in sorted(OUT.iterdir()):
  if p.suffix not in ['.png','.svg','.webp','.mp4']:continue
  item={'file':p.name,'url':'/tadazz-show/family-mixup/media/'+p.name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
  item['provenance']='Imagegen production artwork derived from approved design references' if p.stem in RASTER_SUBJECTS else 'Original deterministic code-authored diagram or finite observation film'
  if p.suffix in ['.png','.webp']:
   with Image.open(p) as im:item.update(width=im.width,height=im.height)
  if p.stem in FACTS:item['evidence']=FACTS[p.stem]
  if p.suffix=='.mp4':
   probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','stream=codec_name,width,height,pix_fmt,r_frame_rate,nb_frames:format=duration','-of','json',str(p)]))
   stream=probe['streams'][0];item.update(width=stream['width'],height=stream['height'],durationSeconds=float(probe['format']['duration']),codec=stream['codec_name'],pixelFormat=stream['pix_fmt'],frameRate=stream['r_frame_rate'],frames=int(stream['nb_frames']))
  assets.append(item)
 (OUT/'manifest.json').write_text(json.dumps({'version':1,'provenance':'Original deterministic diagrams and silent observation films authored for Tadazz Family Mix-Up. Raster subject assets are separately attributed.','assets':assets},indent=2)+'\n')
 print('manifest',len(assets),flush=True)

if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('--diagrams',action='store_true');ap.add_argument('--diagram',choices=['cake-boxes']);ap.add_argument('--videos',action='store_true');ap.add_argument('--clip');ap.add_argument('--manifest',action='store_true');a=ap.parse_args()
 if a.diagrams:diagrams()
 if a.diagram:cake_boxes()
 if a.videos:
  for k,(dur,fn) in CLIPS.items():video(k,dur,fn)
 if a.clip:video(a.clip,*CLIPS[a.clip])
 if a.manifest or a.diagrams or a.diagram or a.videos or a.clip:manifest()
