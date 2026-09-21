#!/usr/bin/env python3
"""
Score for the film: an ORIGINAL instrumental piece written for it, in the
style of about 1500 -- not a reconstruction of a surviving work.

Why it sounds the way it does:
  * Dorian mode on D, the commonest modal colour of German secular song of
    the period; no leading note, no functional dominant cadences.
  * Voices a lute (plucked, here synthesised by Karplus-Strong), two
    recorders, a bowed viol drone in open fifths, and the Minster bells.
  * Slow triple metre with a tenor-led melody, after the tenorlied that a
    Swabian town would have heard around 1500.
Everything is synthesised from scratch with numpy; no samples are used.
"""
import math
import struct
import wave

import numpy as np

SR = 44100
DUR = 214.0
N = int(SR * DUR)

rng = np.random.default_rng(1500)

# --------------------------------------------------------------- the mode --
# Dorian on D: D E F G A B C. Degree 1 = D4.
ROOT = 293.6648
DORIAN = [0, 2, 3, 5, 7, 9, 10]


def pitch(degree, octave=0):
    """Scale degree (1-based, may run past the octave) to frequency."""
    if degree == 0:
        return 0.0
    d = degree - 1
    oct_extra, step = divmod(d, 7)
    semis = DORIAN[step] + 12 * (oct_extra + octave)
    return ROOT * (2 ** (semis / 12))


out = np.zeros((N, 2), dtype=np.float64)


def place(sig, start, pan=0.0, gain=1.0):
    i0 = int(start * SR)
    if i0 >= N:
        return
    seg = sig[: N - i0]
    l = gain * math.sqrt(0.5 * (1.0 - pan))
    r = gain * math.sqrt(0.5 * (1.0 + pan))
    out[i0:i0 + len(seg), 0] += seg * l
    out[i0:i0 + len(seg), 1] += seg * r


# ------------------------------------------------------------ instruments --
def lute(freq, dur, amp=0.5, bright=0.5):
    """Karplus-Strong pluck: a real plucked-string algorithm, gut-string soft."""
    if freq <= 0:
        return np.zeros(1)
    L = max(2, int(SR / freq))
    n = int(SR * dur)
    buf = rng.uniform(-1, 1, L)
    # a plucked gut string has little top end: smooth the excitation
    k = int(L * (0.16 + 0.3 * (1 - bright)))
    if k > 1:
        buf = np.convolve(buf, np.ones(k) / k, mode='same')
    y = np.empty(n)
    damp = 0.494 + 0.0055 * bright
    prev = 0.0
    idx = 0
    for i in range(n):
        v = buf[idx]
        y[i] = v
        nxt = damp * (v + prev) + 0.012 * buf[(idx + 1) % L]
        prev = v
        buf[idx] = nxt
        idx = (idx + 1) % L
    env = np.exp(-np.linspace(0, 1, n) * 2.6)
    y *= env
    # body resonance
    y = np.convolve(y, np.array([1.0, 0.42, -0.18, 0.08]), mode='same')
    return y * amp


def recorder(freq, dur, amp=0.35, vib=0.5, breath=1.0):
    n = int(SR * dur)
    t = np.arange(n) / SR
    v = 1.0 + vib * 0.0055 * np.sin(2 * np.pi * 4.9 * t + rng.uniform(0, 6))
    ph = 2 * np.pi * freq * np.cumsum(v) / SR
    # a recorder is nearly a pure tone with a weak octave and a trace of the 3rd
    y = np.sin(ph) + 0.22 * np.sin(2 * ph) + 0.06 * np.sin(3 * ph)
    # chiff at the onset and a breath floor
    noise = rng.normal(0, 1, n)
    noise = np.convolve(noise, np.ones(40) / 40, mode='same')
    att = min(0.055, dur * 0.25)
    rel = min(0.10, dur * 0.3)
    env = np.ones(n)
    a = int(att * SR)
    r = int(rel * SR)
    env[:a] = np.linspace(0, 1, a) ** 1.4
    env[n - r:] = np.linspace(1, 0, r) ** 1.6
    y = y * env + noise * env * 0.05 * breath + noise[:n] * np.exp(-t * 60) * 0.10 * breath
    return y * amp


def viol(freq, dur, amp=0.18):
    """Bowed open string: sawtooth-ish, slow swell, slightly unstable pitch."""
    n = int(SR * dur)
    t = np.arange(n) / SR
    drift = 1.0 + 0.0018 * np.sin(2 * np.pi * 0.23 * t + rng.uniform(0, 6))
    y = np.zeros(n)
    for h in range(1, 13):
        y += np.sin(2 * np.pi * freq * h * np.cumsum(drift) / SR) / (h ** 1.35)
    bow = 1.0 + 0.03 * np.sin(2 * np.pi * 0.7 * t)
    att = min(0.9, dur * 0.3)
    env = np.clip(t / att, 0, 1) * np.clip((dur - t) / max(0.6, dur * 0.25), 0, 1)
    return y * env * bow * amp


def bell(freq, dur, amp=0.4):
    """Inharmonic partials, as a cast bronze bell rings."""
    n = int(SR * dur)
    t = np.arange(n) / SR
    parts = [(0.5, 1.0, 1.0), (1.0, 0.9, 0.85), (1.19, 0.55, 0.7), (1.5, 0.5, 0.6),
             (2.0, 0.42, 0.45), (2.5, 0.26, 0.3), (2.66, 0.2, 0.26), (3.01, 0.16, 0.2),
             (4.1, 0.1, 0.13), (5.4, 0.06, 0.09)]
    y = np.zeros(n)
    for ratio, a, decay in parts:
        y += a * np.sin(2 * np.pi * freq * ratio * t + rng.uniform(0, 6)) * np.exp(-t / (dur * decay * 0.4))
    strike = rng.normal(0, 1, n) * np.exp(-t * 90) * 0.25
    return (y + strike) * amp * np.exp(-t / (dur * 0.9))


# ------------------------------------------------------------- the score ---
BEAT = 60.0 / 62.0          # a slow triple measure
BAR = 6 * BEAT

# chord plan: (bar, root degree, quality) -- i, IV, VII, v in the Dorian set
PROGRESSION = [1, 1, 4, 4, 7, 7, 1, 1, 4, 1, 7, 5, 1, 1, 4, 7, 1, 1]


def chord_tones(deg):
    return [deg, deg + 2, deg + 4]


# melody A and B as (degree, beats); degree 0 is a rest
MEL_A = [(5, 2), (8, 1), (7, 1), (6, 2),
         (5, 3), (4, 1), (3, 2),
         (4, 2), (5, 2), (6, 2),
         (5, 4), (0, 2)]
MEL_B = [(3, 2), (4, 1), (5, 1), (6, 2),
         (7, 3), (6, 1), (5, 2),
         (4, 2), (3, 2), (2, 2),
         (1, 4), (0, 2)]
MEL_C = [(8, 4), (7, 2),
         (6, 4), (5, 2),
         (4, 3), (5, 1), (6, 2),
         (5, 6)]


def play_melody(mel, start, octave=0, amp=0.3, pan=-0.2, interval=0, stretch=1.0):
    t = start
    for deg, beats in mel:
        d = beats * BEAT * stretch
        if deg:
            place(recorder(pitch(deg, octave), d * 0.97, amp=amp), t, pan=pan)
            if interval:
                place(recorder(pitch(deg + interval, octave), d * 0.97, amp=amp * 0.55), t, pan=-pan)
        t += d
    return t


def play_lute(start, bars, pattern='arp', amp=0.32, base_bar=0):
    t = start
    for b in range(bars):
        deg = PROGRESSION[(base_bar + b) % len(PROGRESSION)]
        tones = chord_tones(deg)
        if pattern == 'arp':
            seq = [tones[0] - 7, tones[1], tones[2], tones[0], tones[2], tones[1]]
        else:
            seq = [tones[0] - 7, 0, tones[1], 0, tones[2], 0]
        for i, d in enumerate(seq):
            if d:
                place(lute(pitch(d, 0), BEAT * 1.9, amp=amp * (1.0 if i == 0 else 0.72)),
                      t + i * BEAT, pan=0.28)
        t += BAR
    return t


def play_drone(start, bars, amp=0.14, base_bar=0):
    t = start
    for b in range(bars):
        deg = PROGRESSION[(base_bar + b) % len(PROGRESSION)]
        place(viol(pitch(deg, -1), BAR * 1.04, amp=amp), t, pan=-0.35)
        place(viol(pitch(deg + 4, -1), BAR * 1.04, amp=amp * 0.8), t, pan=0.35)
        t += BAR
    return t


# --- I. the bells, over the opening title ---------------------------------
for i, t in enumerate([0.6, 4.3, 8.0]):
    place(bell(pitch(1, -1) * 2, 13.0, amp=0.34 - i * 0.03), t, pan=-0.12 + i * 0.12)
place(bell(pitch(5, -1) * 2, 14.0, amp=0.20), 6.2, pan=0.25)
play_drone(2.0, 3, amp=0.10)

# --- II. the town: lute and the first recorder -----------------------------
play_lute(15.0, 8, amp=0.30)
play_drone(15.0, 8, amp=0.12)
play_melody(MEL_A, 20.5, octave=1, amp=0.26, pan=-0.22)

# --- III. the river and the quarter: fuller ---------------------------------
play_lute(59.0, 8, amp=0.32, base_bar=8)
play_drone(59.0, 8, amp=0.13, base_bar=8)
play_melody(MEL_B, 60.5, octave=1, amp=0.25, pan=-0.25)
place(viol(pitch(5, 0), 22.0, amp=0.07), 62.0, pan=0.4)

# --- IV. the Minster: slower, graver ---------------------------------------
play_drone(103.0, 9, amp=0.15, base_bar=4)
play_lute(103.0, 9, pattern='sparse', amp=0.26, base_bar=4)
play_melody(MEL_C, 105.0, octave=1, amp=0.24, pan=-0.1, stretch=1.22)
place(bell(pitch(1, -1) * 2, 15.0, amp=0.20), 106.0, pan=0.2)
place(bell(pitch(4, -1) * 2, 14.0, amp=0.15), 118.0, pan=-0.2)

# --- V. the fields: melody A returns, two recorders in thirds ---------------
play_lute(150.0, 7, amp=0.31, base_bar=2)
play_drone(150.0, 7, amp=0.13, base_bar=2)
play_melody(MEL_A, 152.0, octave=1, amp=0.24, pan=-0.28, interval=2)

# --- VI. the farewell -------------------------------------------------------
play_drone(192.0, 3, amp=0.16, base_bar=0)
for i, d in enumerate([8, 7, 6, 5]):
    place(lute(pitch(d, 0), 3.4, amp=0.30), 192.5 + i * 1.6, pan=0.25)
place(recorder(pitch(5, 1), 6.0, amp=0.22), 199.0, pan=-0.2)
place(recorder(pitch(1, 1), 9.0, amp=0.22), 204.0, pan=-0.2)
place(recorder(pitch(5, 0), 9.0, amp=0.16), 204.0, pan=0.25)
place(viol(pitch(1, -1), 11.0, amp=0.18), 203.5, pan=-0.3)
place(viol(pitch(5, -1), 11.0, amp=0.14), 203.5, pan=0.3)
place(bell(pitch(1, -1) * 2, 13.0, amp=0.28), 203.0, pan=0.0)

# ------------------------------------------------------------- the church --
# A short convolution reverb: stone nave, long but not muddy.
def reverb(sig, seconds=2.6, mix=0.34):
    L = int(SR * seconds)
    t = np.arange(L) / SR
    ir = rng.normal(0, 1, (L, 2)) * np.exp(-t / (seconds * 0.32))[:, None]
    ir[: int(SR * 0.012)] *= 0.05                    # a little pre-delay
    # early reflections
    for d, a in [(0.021, 0.5), (0.037, 0.38), (0.058, 0.3), (0.081, 0.22), (0.113, 0.16)]:
        i = int(d * SR)
        if i < L:
            ir[i, :] += a
    ir /= np.abs(ir).max()
    n_fft = 1 << int(math.ceil(math.log2(len(sig) + L)))
    wet = np.zeros_like(sig)
    for ch in range(2):
        S = np.fft.rfft(sig[:, ch], n_fft)
        I = np.fft.rfft(ir[:, ch], n_fft)
        wet[:, ch] = np.fft.irfft(S * I, n_fft)[: len(sig)]
    wet *= np.abs(sig).max() / (np.abs(wet).max() + 1e-9)
    return sig * (1 - mix) + wet * mix


print('rendering voices ...')
mix = reverb(out)

# gentle overall shaping: fade in, fade out, soft limiter
t = np.arange(N) / SR
fade = np.clip(t / 2.0, 0, 1) * np.clip((DUR - 1.0 - t) / 6.0, 0, 1)
mix *= fade[:, None]
peak = np.abs(mix).max()
mix = np.tanh(mix / (peak * 0.85)) * 0.86

pcm = (np.clip(mix, -1, 1) * 32767).astype('<i2')
with wave.open('music/ulm-1500.wav', 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print('wrote music/ulm-1500.wav  %.1f s' % DUR)
