import json, wave, numpy as np
SR=48000
tl=json.load(open('timeline.json')); total=tl['total']; N=int(total*SR)+SR//2
def readwav(p):
    w=wave.open(p); sr=w.getframerate(); x=np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16).astype(np.float32)/32768
    t_old=np.arange(len(x))/sr; t_new=np.arange(int(len(x)*SR/sr))/SR
    return np.interp(t_new,t_old,x)
vo=np.zeros(N,np.float32)
for l in tl['tl']:
    x=readwav(f'vo/{l["id"]}.wav'); s=int(l['start']*SR); vo[s:s+len(x)]+=x[:N-s]
# normalize VO peak to -1 dBFS
vo*=0.89/np.max(np.abs(vo))
# --- music bed: 100 bpm, Am - F - C - G pad + soft kick + hat ---
bpm=100; beat=60/bpm; t=np.arange(N)/SR
def note(m): return 440*2**((m-69)/12)
chords=[[57,60,64],[53,57,60],[48,52,55],[55,59,62]]  # Am F C G
bar=4*beat; pad=np.zeros(N,np.float32)
for i in range(int(total/bar)+2):
    s=int(i*bar*SR); e=min(N,int((i+1)*bar*SR)+int(0.3*SR)); 
    if s>=N: break
    tt=np.arange(e-s)/SR; env=np.minimum(1,tt/0.6)*np.minimum(1,(e-s)/SR-tt+0.05)
    for m in chords[i%4]:
        for det in (-0.08,0.08):
            pad[s:e]+= (np.sin(2*np.pi*note(m)*(1+det/100)*tt)+0.3*np.sin(2*np.pi*note(m+12)*tt))*env*0.05
    # bass
    pad[s:e]+=np.sin(2*np.pi*note(chords[i%4][0]-12)*tt)*env*0.09
drums=np.zeros(N,np.float32)
for k in range(int(total/beat)+1):
    s=int(k*beat*SR); L=int(0.25*SR); tt=np.arange(min(L,N-s))/SR
    if len(tt)==0: break
    f=50+80*np.exp(-tt*30); drums[s:s+len(tt)]+=np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-tt*14)*0.5
    hs=int((k*beat+beat/2)*SR); hl=min(int(0.05*SR),N-hs)
    if hl>0: drums[hs:hs+hl]+=np.random.default_rng(k).standard_normal(hl)*np.exp(-np.arange(hl)/SR*90)*0.06
music=pad+drums
# simple low-pass on music to keep it under the voice
from numpy.fft import rfft, irfft
music=irfft(rfft(music)*(1/(1+(np.fft.rfftfreq(N,1/SR)/4000)**4)),n=N)
# fade in/out
fade=np.ones(N); fi=int(0.4*SR); fo=int(1.0*SR); fade[:fi]=np.linspace(0,1,fi); fade[-fo:]=np.linspace(1,0,fo); music*=fade
# duck under voice
envv=np.convolve(np.abs(vo),np.ones(int(0.08*SR))/int(0.08*SR),mode='same'); duck=1-0.55*np.clip(envv/0.05,0,1)
music=music/np.max(np.abs(music))*0.28*duck
mix=vo+music; mix/=max(1,np.max(np.abs(mix))/0.95)
st=np.stack([mix,mix],1); st=(st*32767).astype(np.int16)
w=wave.open('mix.wav','wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(st.tobytes()); w.close()
# captions SRT for upload
def ts(x): h=int(x//3600); m=int(x%3600//60); s=x%60; return f"{h:02}:{m:02}:{int(s):02},{int((s%1)*1000):03}"
with open('captions.srt','w') as f:
    for i,l in enumerate(tl['tl'],1): f.write(f"{i}\n{ts(l['start'])} --> {ts(l['start']+l['dur'])}\n{l['text']}\n\n")
print('ok',total)
