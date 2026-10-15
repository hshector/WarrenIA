"""Soundtrack for the WarrenIA promo, synthesised from scratch (no samples, no third-party audio).

A minimal 120 BPM electronic bed in A minor plus UI effects, placed on the same timeline as the
video (src/timeline.json). The mix is rendered 2 s longer and the tail is wrapped onto the start,
so the 18 s file loops without a seam, like the picture.

Usage: python scripts/make_audio.py            (writes public/audio/*.wav)
Needs numpy and scipy; ffmpeg for loudness normalisation (-14 LUFS, -1.5 dBTP).
"""

from __future__ import annotations

import json
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

ROOT = Path(__file__).resolve().parents[1]
TL = json.loads((ROOT / "src" / "timeline.json").read_text())
OUT = ROOT / "public" / "audio"
SR = 48_000
FPS = TL["fps"]
BEAT = 60 / TL["bpm"]
DUR = TL["durationInFrames"] / FPS
rng = np.random.default_rng(7)


def sec(frame: float) -> float:
    return frame / FPS


def note(n: str) -> float:
    names = {"C": -9, "D": -7, "E": -5, "F": -4, "G": -2, "A": 0, "B": 2}
    semis = names[n[0]] + (1 if "#" in n else 0) + (int(n[-1]) - 4) * 12
    return 440.0 * 2 ** (semis / 12)


def lp(x, f, order=2):
    return sosfilt(butter(order, f, "low", fs=SR, output="sos"), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, "high", fs=SR, output="sos"), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], "band", fs=SR, output="sos"), x)


class Bus:
    def __init__(self, seconds: float):
        self.x = np.zeros((int(seconds * SR), 2))

    def add(self, t: float, sig: np.ndarray, gain=1.0, pan=0.0):
        i = int(t * SR)
        if sig.ndim == 1:
            l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
            sig = np.stack([sig * l * 1.414, sig * r * 1.414], axis=1)
        if i < 0:
            sig, i = sig[-i:], 0
        j = min(len(self.x), i + len(sig))
        if j > i:
            self.x[i:j] += sig[: j - i] * gain


def env(n, a, d, sustain_to=0.0):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d)
    return e * (1 - sustain_to) + sustain_to


# ------------------------------------------------------------- instruments
def saw_stack(freq, seconds, cutoff=3500, detune=(-7, 0, 7)):
    t = np.arange(int(seconds * SR)) / SR
    out = np.zeros_like(t)
    for cents in detune:
        f = freq * 2 ** (cents / 1200)
        ph = rng.uniform(0, 2 * np.pi)
        for k in range(1, int(cutoff / f) + 1):
            out += np.sin(2 * np.pi * f * k * t + ph * k) / k
    return out / len(detune)


def pad_chord(freqs, seconds, attack=0.5, release=0.7):
    n = int(seconds * SR)
    sig = sum(saw_stack(f, seconds, cutoff=2400) for f in freqs) / len(freqs)
    t = np.arange(n) / SR
    e = np.minimum(1, t / attack) * np.minimum(1, (seconds - t) / release).clip(0, 1)
    return lp(sig, 1400) * e


def pluck(freq, seconds=0.5, tone=0.25):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * freq * t) + tone * np.sin(2 * np.pi * 2 * freq * t) + 0.08 * np.sin(2 * np.pi * 3 * freq * t)
    return s * env(n, 0.003, 0.16)


def kick():
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 45 + 85 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / 0.22)
    click = hp(rng.normal(size=n), 2500) * np.exp(-t / 0.004) * 0.25
    return np.tanh(1.6 * (body + click))


def hat(open_=False):
    n = int((0.18 if open_ else 0.05) * SR)
    t = np.arange(n) / SR
    return hp(rng.normal(size=n), 7500, 4) * np.exp(-t / (0.06 if open_ else 0.014))


def clap():
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    e = np.zeros(n)
    for k, off in enumerate((0, 0.011, 0.022)):
        e += (t >= off) * np.exp(-(t - off).clip(0) / (0.006 if k < 2 else 0.11))
    return bp(rng.normal(size=n), 900, 3200) * e * 0.8


def sub(freq, seconds):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * freq * t) * env(n, 0.004, seconds * 0.6) * np.minimum(1, (seconds - t) / 0.02).clip(0, 1)


def tick(soft=False):
    n = int(0.03 * SR)
    t = np.arange(n) / SR
    f = rng.uniform(2600, 3400)
    s = 0.6 * hp(rng.normal(size=n), 3000) * np.exp(-t / 0.0025) + 0.5 * np.sin(2 * np.pi * f * t) * np.exp(-t / 0.006)
    return s * (0.45 if soft else 1)


def ui_click(pitch=1.0):
    n = int(0.08 * SR)
    t = np.arange(n) / SR
    body = np.sin(2 * np.pi * 1300 * pitch * t) * np.exp(-t / 0.012)
    snap = hp(rng.normal(size=n), 4000) * np.exp(-t / 0.002)
    low = np.sin(2 * np.pi * 220 * pitch * t) * np.exp(-t / 0.02) * 0.5
    return body * 0.5 + snap * 0.5 + low


def sweep_noise(seconds, f0, f1, shape="up"):
    """Band-passed noise whose centre glides f0 → f1 (blockwise, cross-faded)."""
    n = int(seconds * SR)
    out = np.zeros(n)
    block = int(0.04 * SR)
    win = np.hanning(block * 2)
    noise = rng.normal(size=n + block * 2)
    for s in range(0, n, block):
        p = s / n
        fc = f0 * (f1 / f0) ** p
        seg = bp(noise[s : s + block * 2], fc / 1.5, min(fc * 1.5, SR / 2 - 100))
        e = min(len(seg), n - s)
        out[s : s + e] += (seg * win[: len(seg)])[:e]
    return out


def bell(freq, seconds=2.2):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    parts = [(1, 1.0, 1.4), (2.0, 0.35, 0.9), (2.76, 0.25, 0.6), (5.4, 0.12, 0.25)]
    return sum(a * np.sin(2 * np.pi * freq * r * t) * np.exp(-t / d) for r, a, d in parts) * np.minimum(1, t / 0.002)


def sparkle(seconds=0.9, count=34):
    n = int(seconds * SR)
    out = np.zeros((n, 2))
    scale = [note(x) for x in ("A5", "C6", "D6", "E6", "G6", "A6", "C7", "E7")]
    for _ in range(count):
        st = rng.uniform(0, seconds * 0.75) ** 1.3 / (seconds * 0.75) ** 0.3
        f = rng.choice(scale)
        m = int(rng.uniform(0.03, 0.09) * SR)
        tt = np.arange(m) / SR
        g = np.sin(2 * np.pi * f * tt) * np.sin(np.pi * tt / tt[-1]) * rng.uniform(0.3, 1)
        pan = rng.uniform(-0.9, 0.9)
        i = int(st * SR)
        j = min(n, i + m)
        out[i:j, 0] += g[: j - i] * np.cos((pan + 1) * np.pi / 4)
        out[i:j, 1] += g[: j - i] * np.sin((pan + 1) * np.pi / 4)
    return out


def impact():
    n = int(1.1 * SR)
    t = np.arange(n) / SR
    f = 34 + 50 * np.exp(-t / 0.1)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.28)
    crack = lp(rng.normal(size=n), 5000) * np.exp(-t / 0.05) * 0.5
    return np.tanh(1.3 * (boom + crack))


def reverb_ir(seconds=2.4, damp=5200):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = np.stack([lp(rng.normal(size=n), damp), lp(rng.normal(size=n), damp)], axis=1)
    ir *= np.exp(-t / (seconds / 6.5))[:, None]
    ir[: int(0.012 * SR)] = 0
    return ir / np.sqrt((ir**2).sum() / 2)


IR = reverb_ir()


def wet(x: np.ndarray, amount: float) -> np.ndarray:
    return np.stack([fftconvolve(x[:, c], IR[:, c])[: len(x)] for c in range(2)], axis=1) * amount


# ------------------------------------------------------------------ score
CHORDS = [
    ("A2", ["A3", "C4", "E4", "G4", "B4"]),  # Am9
    ("F2", ["F3", "A3", "C4", "E4"]),  # Fmaj7
    ("C3", ["C4", "E4", "G4", "B4"]),  # Cmaj7
    ("G2", ["G3", "B3", "D4", "E4"]),  # G6
]
BAR = 4 * BEAT


def chord_at(t: float):
    return CHORDS[int(t // BAR) % 4]


def music(text: str, total: float, full: bool) -> np.ndarray:
    pad, beat, fx, send = Bus(total), Bus(total), Bus(total), Bus(total)

    # Pad: continuous, one chord per bar, overlapping so changes are soft.
    bars = int(np.ceil(total / BAR)) + 1
    for b in range(bars):
        root, tones = CHORDS[b % 4]
        sig = pad_chord([note(x) for x in tones], BAR + 0.9, attack=0.45, release=0.8)
        pad.add(b * BAR - 0.2, sig, 0.16, 0)

    H = TL["hook"]
    # Typing ticks: one per character, softer on spaces, none on the line break.
    for i, ch in enumerate(text):
        if ch == "\n":
            continue
        fx.add(sec(H["typeStart"] + i * H["charEvery"]) + 0.004, tick(soft=ch == " "), 0.32, rng.uniform(-0.2, 0.2))
    fx.add(sec(H["sendAt"]), ui_click(0.9), 0.5)

    if full:
        R, P, F, C = TL["reveal"], TL["product"], TL["features"], TL["close"]
        # Riser into the bracket hit.
        t0, t1 = sec(R["start"]), sec(R["brackets"])
        rise = sweep_noise(t1 - t0, 300, 9000)
        rise *= np.linspace(0, 1, len(rise)) ** 2.2
        fx.add(t0, rise, 0.22)
        send.add(t0, rise, 0.12)
        sp = sparkle(1.1)
        fx.add(sec(R["burst"]), sp, 0.22)
        send.add(sec(R["burst"]), sp, 0.3)
        hit = impact()
        fx.add(sec(R["brackets"]), hit, 0.55)
        send.add(sec(R["brackets"]), hit, 0.25)
        ch = pad_chord([note(x) for x in ("A3", "E4", "A4", "C5", "E5")], 1.6, attack=0.005, release=1.2)
        fx.add(sec(R["brackets"]), ch, 0.35)
        send.add(sec(R["brackets"]), ch, 0.35)

        # Groove from the product cut to the flip.
        g0, g1 = sec(P["start"]), sec(C["flip"])
        nb = int(round((g1 - g0) / BEAT))
        for k in range(nb):
            t = g0 + k * BEAT
            beat.add(t, kick(), 0.62)
            beat.add(t + BEAT / 2, hat(), 0.16, 0.25)
            beat.add(t + BEAT / 4, hat(), 0.05, -0.25)
            beat.add(t + 3 * BEAT / 4, hat(), 0.05, -0.25)
            if t >= sec(F["plan"]) - 1e-6 and k % 2 == 1:
                beat.add(t, clap(), 0.2, 0.05)
                send.add(t, clap(), 0.05)
            root = note(chord_at(t)[0])
            for e in (0, 0.5):
                beat.add(t + e * BEAT, sub(root, BEAT * 0.45), 0.42)
        # Arpeggio across the whole piece, louder inside the groove.
        for k in range(int(total / (BEAT / 4))):
            t = k * BEAT / 4
            tones = [note(x) * 2 for x in chord_at(t)[1]]
            seq = [0, 2, 1, 3, 2, 4, 1, 3]
            f = tones[seq[k % len(seq)] % len(tones)]
            in_groove = g0 <= t < g1
            level = 0.10 if in_groove else (0.05 if t >= sec(R["brackets"]) else 0.0)
            if t >= sec(C["outro"]):
                level = 0.0
            if level:
                p = pluck(f, 0.4)
                fx.add(t, p, level, 0.35 * np.sin(k))
                send.add(t, p, level * 0.8)

        # Product: soft rising count ticks while the figure counts.
        for k in range(14):
            t = sec(P["countStart"]) + (k / 14) ** 1.6 * sec(P["countEnd"] - P["countStart"])
            fx.add(t, tick(), 0.12 * (1 - k / 16), 0.3)

        # Feature cuts and summary chips.
        for key, pitch in (("plan", 1.0), ("radar", 1.12), ("sell", 1.26)):
            fx.add(sec(F[key]), ui_click(pitch), 0.55)
        for i in range(4):
            fx.add(sec(F["summary"] + i * 3), ui_click(1.0 + 0.12 * i), 0.32)

        # Flip, wordmark, outro.
        sw = sweep_noise(sec(C["flipEnd"] - C["flip"]) + 0.15, 400, 6000)
        sw *= np.sin(np.linspace(0, np.pi, len(sw))) ** 1.5
        rev = sweep_noise(0.5, 6000, 900)[::-1]
        rev *= np.linspace(0, 1, len(rev)) ** 2
        fx.add(sec(C["flip"]) - 0.5, rev, 0.12)
        fx.add(sec(C["flip"]), sw, 0.3)
        send.add(sec(C["flip"]), sw, 0.2)
        for f0, d, g in ((note("A5"), 0, 0.22), (note("E6"), 0.09, 0.14)):
            b = bell(f0)
            fx.add(sec(C["flipEnd"] + 10) + d, b, g)
            send.add(sec(C["flipEnd"] + 10) + d, b, g * 1.2)
        out = sweep_noise(0.35, 5000, 500)
        out *= np.sin(np.linspace(0, np.pi, len(out)))
        fx.add(sec(C["black"]), out, 0.12)
        fx.add(sec(C["black"] + 22), ui_click(0.8), 0.22)

    # Sidechain the pad under the kick in the groove.
    if full:
        duck = np.ones(len(pad.x))
        g0, g1 = sec(TL["product"]["start"]), sec(TL["close"]["flip"])
        for k in range(int(round((g1 - g0) / BEAT))):
            i = int((g0 + k * BEAT) * SR)
            m = int(0.3 * SR)
            duck[i : i + m] = np.minimum(duck[i : i + m], 1 - 0.55 * np.exp(-np.arange(m) / SR / 0.09))
        pad.x *= duck[:, None]

    mix = pad.x + beat.x + fx.x + wet(send.x + pad.x * 0.35, 0.5)
    return np.tanh(mix * 1.1) / 1.1


def wrap(x: np.ndarray, seconds: float) -> np.ndarray:
    """Fold the tail past `seconds` onto the start: a seamless loop."""
    n = int(seconds * SR)
    out = x[:n].copy()
    tail = x[n:]
    out[: len(tail)] += tail
    return out


def write(path: Path, x: np.ndarray):
    x = x / max(1e-9, np.abs(x).max()) * 0.89
    raw = path.with_suffix(".raw.wav")
    with wave.open(str(raw), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype("<i2").tobytes())
    subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-y", "-i", str(raw), "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", str(SR), str(path)],
        check=True,
    )
    raw.unlink()
    print("wrote", path.relative_to(ROOT))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    full = music(TL["hook"]["texts"]["A"], DUR + 2.5, True)
    write(OUT / "soundtrack.wav", wrap(full, DUR))
    for k, text in TL["hook"]["texts"].items():
        hook = music(text, 2.5 + 2.0, False)[: int(2.5 * SR)]
        fade = np.minimum(1, np.arange(len(hook))[::-1] / (0.08 * SR))[:, None]
        write(OUT / f"hook-{k}.wav", hook * fade)


if __name__ == "__main__":
    sys.exit(main())
