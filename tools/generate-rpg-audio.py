#!/usr/bin/env python3
"""Generate original, dependency-free audio cues for the RPG interface."""
from __future__ import annotations
import math, random, struct, wave
from pathlib import Path
RATE = 16_000
OUTPUT = Path(__file__).resolve().parents[1] / "server/static/rpg/assets/audio"
RNG = random.Random(14081998)
def envelope(p, d, a=.02, r=.08): return min(1., p / max(a, 1e-6), (d - p) / max(r, 1e-6))
def tone(p, start, d, f, volume=1., end=None, waveform="sine"):
    local = p - start
    if local < 0 or local >= d: return 0.
    end = f if end is None else end
    progress = local / d
    phase = 2 * math.pi * (f * local + (end - f) * local * progress / 2)
    value = math.sin(phase)
    if waveform == "triangle": value = 2 / math.pi * math.asin(value)
    return value * volume * envelope(local, d)
def noise(p, start, d, volume=1.):
    local = p - start
    if local < 0 or local >= d: return 0.
    return RNG.uniform(-1, 1) * volume * envelope(local, d, .008, .06)
def write(name, duration, render, loop_fade=False):
    frames = []
    for index in range(int(RATE * duration)):
        p = index / RATE
        value = render(p)
        if loop_fade:
            fade = min(1., p / .18, (duration - p) / .18)
            value *= .82 + .18 * fade
        frames.append(struct.pack("<h", int(max(-1, min(1, value)) * 32767)))
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUTPUT / name), "wb") as target:
        target.setnchannels(1); target.setsampwidth(2); target.setframerate(RATE)
        target.writeframes(b"".join(frames))
def write_samples(name, samples, peak=.72):
    highest = max((abs(value) for value in samples), default=1.) or 1.
    scale = peak / highest
    frames = [struct.pack("<h", int(max(-1, min(1, value * scale)) * 32767)) for value in samples]
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUTPUT / name), "wb") as target:
        target.setnchannels(1); target.setsampwidth(2); target.setframerate(RATE)
        target.writeframes(b"".join(frames))
def write_stereo_samples(name, channels, sample_rate, peak=.72):
    highest = max((abs(value) for channel in channels for value in channel), default=1.) or 1.
    scale = peak / highest
    frames = []
    for left, right in zip(*channels):
        frames.append(struct.pack("<hh", int(max(-1, min(1, left * scale)) * 32767),
                                  int(max(-1, min(1, right * scale)) * 32767)))
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUTPUT / name), "wb") as target:
        target.setnchannels(2); target.setsampwidth(2); target.setframerate(sample_rate)
        target.writeframes(b"".join(frames))
def rain_samples(duration):
    """Periodic filtered noise plus wrapped droplets: rain, without an audible loop seam."""
    total = int(RATE * duration)
    rng = random.Random(802001)
    white = [rng.uniform(-1., 1.) for _ in range(total)]
    bed = [0.] * total
    low = 0.
    # Repeating the same cycle settles the filter at a state compatible with the loop boundary.
    for cycle in range(5):
        for index, value in enumerate(white):
            low += .045 * (value - low)
            if cycle == 4:
                bed[index] = low * .72 + (value - low) * .16
    samples = [value * .34 for value in bed]
    for _ in range(int(duration * 34)):
        start = rng.randrange(total)
        length = rng.randrange(int(RATE * .018), int(RATE * .065))
        frequency = rng.uniform(1250., 3100.)
        strength = rng.uniform(.055, .19)
        phase = rng.uniform(0., 2 * math.pi)
        for offset in range(length):
            progress = offset / length
            decay = math.exp(-progress * 7.5)
            chirp = math.sin(phase + 2 * math.pi * frequency * (offset / RATE) * (1 - .42 * progress))
            splash = rng.uniform(-1., 1.) * .42
            samples[(start + offset) % total] += strength * decay * (chirp * .58 + splash)
    return samples
def settled_noise(total, seed, alpha):
    """One-pole filtered periodic noise whose filter state is settled across the loop."""
    rng = random.Random(seed)
    white = [rng.uniform(-1., 1.) for _ in range(total)]
    filtered = [0.] * total
    state = 0.
    for cycle in range(6):
        for index, value in enumerate(white):
            state += alpha * (value - state)
            if cycle == 5: filtered[index] = state
    return white, filtered
def grassy_samples(duration):
    """Soft wind moving through leaves, with irregular wrapped rustles."""
    total = int(RATE * duration)
    _, leaf_fast = settled_noise(total, 47001, .045)
    _, leaf_slow = settled_noise(total, 47001, .007)
    _, wind = settled_noise(total, 47002, .0014)
    samples = []
    for index in range(total):
        time = index / RATE
        gust = .48 + .24 * math.sin(2 * math.pi * .25 * time) + .16 * math.sin(2 * math.pi * .375 * time + 1.1)
        leaves = leaf_fast[index] - leaf_slow[index]
        samples.append(wind[index] * 1.05 + leaves * (.22 + .34 * max(.08, gust)))
    rng = random.Random(47003)
    for _ in range(int(duration * 4)):
        start = rng.randrange(total)
        length = rng.randrange(int(RATE * .08), int(RATE * .22))
        strength = rng.uniform(.018, .045)
        frequency = rng.uniform(150., 360.)
        for offset in range(length):
            progress = offset / length
            shape = math.sin(math.pi * progress) ** 1.7
            movement = math.sin(2 * math.pi * frequency * offset / RATE + math.sin(progress * math.pi * 3) * .5)
            samples[(start + offset) % total] += movement * strength * shape
    return samples
def electric_samples(duration):
    """Low electrical current punctuated by small sparks and travelling crackles."""
    total = int(RATE * duration)
    samples = [
        .026 * math.sin(2 * math.pi * 60 * index / RATE) +
        .012 * math.sin(2 * math.pi * 120 * index / RATE)
        for index in range(total)
    ]
    rng = random.Random(33001)
    for _ in range(int(duration * 5.5)):
        start = rng.randrange(total)
        pulses = rng.randrange(2, 6)
        spacing = rng.randrange(int(RATE * .006), int(RATE * .018))
        frequency = rng.uniform(1450., 3600.)
        strength = rng.uniform(.09, .24)
        for pulse in range(pulses):
            length = rng.randrange(int(RATE * .004), int(RATE * .013))
            for offset in range(length):
                progress = offset / length
                decay = (1 - progress) ** 2
                phase = 2 * math.pi * frequency * offset / RATE
                crackle = math.sin(phase) * .62 + rng.uniform(-1., 1.) * .38
                samples[(start + pulse * spacing + offset) % total] += strength * decay * crackle
    return samples
def misty_samples(duration):
    """Airy, diffuse mist with sparse glassy droplets; deliberately unlike Psychic's pad."""
    total = int(RATE * duration)
    _, breath_fast = settled_noise(total, 55001, .105)
    _, breath_slow = settled_noise(total, 55001, .018)
    _, body = settled_noise(total, 55003, .002)
    samples = []
    for index in range(total):
        time = index / RATE
        breath = .55 + .18 * math.sin(2 * math.pi * .125 * time + .4) + .12 * math.sin(2 * math.pi * .25 * time)
        airy = breath_fast[index] - breath_slow[index]
        soft_chord = .012 * math.sin(2 * math.pi * 349 * time + .35 * math.sin(2 * math.pi * .125 * time))
        soft_chord += .009 * math.sin(2 * math.pi * 524 * time + .5)
        samples.append((body[index] * .62 + airy * .075) * breath + soft_chord)
    rng = random.Random(55002)
    for note, start_time in enumerate((.65, 1.9, 3.35, 5.1, 6.55, 7.4)):
        start = int(start_time * RATE) % total
        length = int(RATE * rng.uniform(.34, .62))
        frequency = rng.choice((740., 880., 988., 1110.))
        strength = rng.uniform(.025, .055)
        for offset in range(length):
            progress = offset / length
            shape = math.sin(math.pi * min(1., progress * 3.2)) * math.exp(-progress * 4.5)
            shimmer = math.sin(2 * math.pi * frequency * offset / RATE) + .35 * math.sin(2 * math.pi * frequency * 1.503 * offset / RATE)
            samples[(start + offset) % total] += strength * shape * shimmer
    return samples
def paralysis_buzz_samples(duration=1.12):
    """Two compact electrical buzzes with a strong body and a decaying, unstable tail."""
    total = int(RATE * duration)
    samples = [0.] * total
    rng = random.Random(182026)

    for pulse_index, (start_time, pulse_duration, base_frequency) in enumerate((
        (.025, .405, 118.),
        (.585, .425, 106.),
    )):
        start = int(start_time * RATE)
        count = min(int(pulse_duration * RATE), total - start)
        phase = rng.uniform(0., 2 * math.pi)
        filtered_noise = 0.
        for offset in range(max(0, count)):
            local_time = offset / RATE
            progress = offset / max(1, count)
            attack = min(1., local_time / .006)
            tail = (1. - progress) ** 1.45
            wobble = 1. + .075 * math.sin(2 * math.pi * 19. * local_time + pulse_index)
            wobble += .035 * math.sin(2 * math.pi * 43. * local_time + .8)
            frequency = base_frequency * wobble
            phase += 2 * math.pi * frequency / RATE
            electrical_body = math.tanh(2.35 * math.sin(phase))
            electrical_body += .24 * math.sin(phase * 2.03 + .45)
            tremolo = .78 + .22 * math.sin(2 * math.pi * 34. * local_time) ** 2
            white = rng.uniform(-1., 1.)
            filtered_noise += .12 * (white - filtered_noise)
            crackle = white - filtered_noise
            samples[start + offset] += attack * tail * (
                electrical_body * .34 * tremolo + crackle * (.055 + .075 * tail)
            )

        # A few short sparks make each discharge start sharply without turning it into a single tick.
        for spark in range(7):
            spark_start = start + int((.008 + spark * .043 + rng.uniform(-.006, .006)) * RATE)
            spark_length = int(rng.uniform(.004, .011) * RATE)
            for offset in range(spark_length):
                index = spark_start + offset
                if not (0 <= index < total): continue
                progress = offset / max(1, spark_length)
                samples[index] += rng.uniform(-1., 1.) * .22 * (1. - progress) ** 2
    return samples

def ice_crack_samples(duration=2.0):
    """Original layered ice fracture: one main split, branching snaps, and a short frozen-plate tail."""
    total = int(RATE * duration)
    samples = [0.] * total
    rng = random.Random(812026)

    def add_fracture(start_time, length, strength, resonances):
        start = int(start_time * RATE)
        count = min(int(length * RATE), total - start)
        low_noise = 0.
        phases = [rng.uniform(0., 2 * math.pi) for _ in resonances]
        for offset in range(max(0, count)):
            progress = offset / max(1, count)
            local_time = offset / RATE
            attack = min(1., local_time / .0018)
            decay = math.exp(-progress * 7.4)
            white = rng.uniform(-1., 1.)
            low_noise += .18 * (white - low_noise)
            brittle = white - low_noise
            ringing = sum(
                math.sin(phase + 2 * math.pi * frequency * local_time * (1. - .16 * progress))
                for phase, frequency in zip(phases, resonances)
            ) / len(resonances)
            samples[start + offset] += strength * attack * decay * (brittle * .72 + ringing * .28)

    fractures = (
        (.018, .145, .92, (1740., 3180., 5480.)),
        (.094, .095, .62, (2260., 3970., 6120.)),
        (.183, .082, .54, (1460., 2860., 4740.)),
        (.292, .115, .48, (1940., 3510., 5690.)),
        (.438, .076, .4, (2520., 4210., 6350.)),
        (.612, .104, .34, (1320., 2640., 5060.)),
        (.823, .072, .28, (2380., 3820., 5920.)),
        (1.078, .086, .23, (1580., 3290., 5280.)),
        (1.352, .061, .17, (2840., 4470., 6480.)),
    )
    for fracture in fractures:
        add_fracture(*fracture)

    for _ in range(17):
        start = rng.uniform(.07, 1.46)
        length = rng.uniform(.008, .024)
        strength = rng.uniform(.055, .14)
        center = rng.uniform(2800., 5700.)
        add_fracture(start, length, strength, (center, min(6900., center * 1.22)))

    body_end = min(total, int(RATE * 1.62))
    phase = 0.
    for index in range(body_end):
        time = index / RATE
        frequency = 148. - 61. * min(1., time / 1.62)
        phase += 2 * math.pi * frequency / RATE
        shape = min(1., time / .012) * math.exp(-time * 2.15)
        irregular = .68 + .32 * math.sin(2 * math.pi * 3.7 * time + .4)
        samples[index] += math.sin(phase) * shape * irregular * .075
    return samples

def audience_reaction_samples(level):
    """Stereo crowd made from irregular handclaps, room movement and nonverbal calls."""
    sample_rate = 32_000
    durations = (1.15, 1.35, 1.65, 2.0, 2.45, 3.0)
    duration = durations[level - 1]
    total = int(sample_rate * duration)
    left = [0.] * total
    right = [0.] * total
    rng = random.Random(290826 + level * 101)

    # A diffuse room bed gives the individual claps a believable shared space.
    states = [0., 0., 0., 0.]
    for index in range(total):
        time = index / sample_rate
        white_l, white_r = rng.uniform(-1., 1.), rng.uniform(-1., 1.)
        states[0] += .035 * (white_l - states[0]); states[1] += .004 * (white_l - states[1])
        states[2] += .035 * (white_r - states[2]); states[3] += .004 * (white_r - states[3])
        fade = min(1., time / .11, (duration - time) / .28)
        swell = .58 + .42 * math.sin(math.pi * min(1., time / duration))
        room_gain = .012 if level == 1 else .016 + level * .005
        if level == 1:
            left[index] += (states[1] * .7 + (states[0] - states[1]) * .1) * fade * .07
            right[index] += (states[3] * .7 + (states[2] - states[3]) * .1) * fade * .07
        else:
            left[index] += (states[0] - states[1]) * fade * swell * room_gain
            right[index] += (states[2] - states[3]) * fade * swell * room_gain

    # Each clap is two short, differently filtered transients with its own stereo position.
    clap_counts = (0, 7, 18, 34, 58, 88)
    for _ in range(clap_counts[level - 1]):
        start_time = rng.uniform(.06, duration - .18)
        pan = rng.uniform(-.88, .88)
        gain_l, gain_r = math.sqrt((1 - pan) / 2), math.sqrt((1 + pan) / 2)
        length = int(rng.uniform(.045, .095) * sample_rate)
        start = int(start_time * sample_rate)
        filtered_fast = filtered_slow = 0.
        strength = rng.uniform(.13, .24) * (.78 + level * .045)
        for offset in range(length):
            target = start + offset
            if not (0 <= target < total): continue
            progress = offset / max(1, length)
            white = rng.uniform(-1., 1.)
            filtered_fast += .36 * (white - filtered_fast)
            filtered_slow += .07 * (white - filtered_slow)
            snap = filtered_fast - filtered_slow
            envelope_value = math.exp(-progress * 9.2) + .34 * math.exp(-max(0., progress - .13) * 18.)
            value = snap * strength * envelope_value
            left[target] += value * gain_l; right[target] += value * gain_r

    # Short breathy calls avoid intelligible speech and electronic sine-like cheering.
    call_counts = (0, 0, 2, 5, 9, 15)
    for _ in range(call_counts[level - 1]):
        start = int(rng.uniform(.08, max(.09, duration - .48)) * sample_rate)
        length = int(rng.uniform(.24, .5) * sample_rate)
        base = rng.uniform(155., 285.)
        phase = rng.uniform(0., 2 * math.pi)
        pan = rng.uniform(-.8, .8)
        gain_l, gain_r = math.sqrt((1 - pan) / 2), math.sqrt((1 + pan) / 2)
        strength = rng.uniform(.018, .037) * (1 + level * .04)
        breath_state = 0.
        for offset in range(length):
            target = start + offset
            if target >= total: break
            progress = offset / max(1, length)
            shape = math.sin(math.pi * progress) ** .7
            frequency = base * (1. + .19 * math.sin(math.pi * progress) + .025 * math.sin(progress * 31.))
            phase += 2 * math.pi * frequency / sample_rate
            breath_state += .18 * (rng.uniform(-1., 1.) - breath_state)
            voice = math.tanh(1.7 * (math.sin(phase) + .24 * math.sin(phase * 2.02)))
            value = (voice * .7 + breath_state * .3) * shape * strength
            left[target] += value * gain_l; right[target] += value * gain_r

    # Level one communicates discomfort through chair movement and a restrained cough.
    if level == 1:
        for event_time in (.28, .73):
            start = int(event_time * sample_rate)
            length = int(.085 * sample_rate)
            for offset in range(length):
                progress = offset / length
                value = rng.uniform(-1., 1.) * .075 * math.sin(math.pi * progress) * math.exp(-progress * 3.)
                left[start + offset] += value * .7; right[start + offset] += value * .45
    return (left, right), sample_rate

def short_effects():
    write("ui-click.wav", .075, lambda t: tone(t, 0, .07, 760, .28, 300, "triangle"))
    write("impact.wav", .18, lambda t: noise(t, 0, .12, .35) + tone(t, 0, .17, 145, .42, 58))
    write("residual-damage.wav", .34, lambda t: noise(t, .02, .24, .16) + tone(t, 0, .32, 185, .28, 112))
    write("heal.wav", .68, lambda t: sum(tone(t, i * .11, .28, f, .25, f * 1.025) for i, f in enumerate((523.25, 659.25, 783.99, 1046.5))))
    write("capture-success.wav", .82, lambda t: sum(tone(t, i * .15, .29, f, .24, f * 1.018, "triangle") for i, f in enumerate((659.25, 830.61, 987.77, 1318.51))))
    write("victory.wav", 1.05, lambda t: sum(tone(t, i * .14, .4, f, .23, f * 1.012, "triangle") for i, f in enumerate((523.25, 659.25, 783.99, 1046.5, 1318.51))))
    write("defeat.wav", .95, lambda t: sum(tone(t, i * .16, .38, f, .22, f * .985, "triangle") for i, f in enumerate((440., 369.99, 293.66, 220.))))
    write("evolution.wav", 1.35, lambda t: tone(t, 0, 1.28, 210, .24, 1040) + sum(tone(t, .28 + i * .16, .34, f, .17, f * 1.04, "triangle") for i, f in enumerate((523.25, 659.25, 783.99, 1046.5, 1318.51))))
    write("capture-throw.wav", .34, lambda t: noise(t, 0, .28, .13) + tone(t, 0, .32, 260, .2, 920))
    write("capture-close.wav", .28, lambda t: tone(t, 0, .16, 980, .24, 190, "triangle") + tone(t, .11, .16, 170, .3, 92))
    write("capture-shake.wav", .18, lambda t: tone(t, 0, .07, 310, .25, 185, "triangle") + tone(t, .085, .08, 210, .2, 330, "triangle"))
    write("capture-failure.wav", .58, lambda t: tone(t, 0, .48, 760, .22, 210) + noise(t, .08, .32, .12))
    write("faint.wav", .78, lambda t: tone(t, 0, .72, 410, .25, 82) + tone(t, .12, .58, 205, .16, 55, "triangle"))
    write("flee-success.wav", .55, lambda t: tone(t, 0, .48, 240, .18, 860) + noise(t, 0, .35, .09))
    write("flee-blocked.wav", .36, lambda t: tone(t, 0, .15, 150, .28, 105, "triangle") + tone(t, .18, .15, 135, .25, 90, "triangle"))
    write("move-blocked.wav", .3, lambda t: tone(t, 0, .24, 920, .24, 310, "triangle") + tone(t, .035, .2, 1380, .13, 460))
    write("status-burn.wav", .62, lambda t: tone(t, 0, .18, 720, .16, 190) + noise(t, .12, .44, .2) * (1 - min(1, t / .62)))
    write("status-poison.wav", .72, lambda t: sum(tone(t, start, .2, frequency, .2, 82, "triangle") + noise(t, start + .12, .06, .1)
        for start, frequency in ((0., 210.), (.2, 255.), (.43, 190.))))
    write_samples("status-paralysis.wav", paralysis_buzz_samples(), .72)
    write("status-sleep.wav", 1.42, lambda t: sum(tone(t, start, .52, frequency, .16, frequency * .995)
        for start, frequency in ((0., 659.25), (.36, 523.25), (.75, 392.), (1.02, 523.25))))
    write_samples("status-freeze.wav", ice_crack_samples(), .78)
    write("berry-bite.wav", .2, lambda t: noise(t, 0, .15, .25) + tone(t, 0, .18, 240, .2, 92, "triangle"))
    write("held-item-activate.wav", .55, lambda t: sum(tone(t, index * .09, .28, frequency, .17, frequency * 1.02)
        for index, frequency in enumerate((620., 830., 1040.))))
    write("level-up.wav", 1.18, lambda t: sum(tone(t, index * .13, .42, frequency, .22, frequency * 1.015, "triangle")
        for index, frequency in enumerate((440., 554.37, 659.25, 880., 1108.73, 1318.51))))
    for level in range(1, 7):
        # Curated contest reactions are replaced manually and must survive routine audio regeneration.
        if (OUTPUT / f"contest-audience-{level}.wav").exists(): continue
        channels, sample_rate = audience_reaction_samples(level)
        write_stereo_samples(f"contest-audience-{level}.wav", channels, sample_rate, .4 + level * .065)
def progression_music_samples(duration):
    notes = (261.63, 329.63, 392., 523.25, 293.66, 369.99, 440., 587.33,
             329.63, 392., 493.88, 659.25, 293.66, 369.99, 440., 587.33)
    total = int(RATE * duration)
    samples = [0.] * total
    for note_index, frequency in enumerate(notes):
        start = note_index * duration / len(notes)
        length = duration / len(notes) * .92
        first = int(start * RATE)
        count = int(length * RATE)
        for offset in range(count):
            progress = offset / count
            shape = math.sin(math.pi * progress) ** 1.4
            time = offset / RATE
            value = math.sin(2 * math.pi * frequency * time) + .24 * math.sin(2 * math.pi * frequency * 2 * time)
            samples[(first + offset) % total] += value * shape * .075
    fade = int(RATE * .35)
    for index in range(fade):
        factor = math.sin((index / fade) * math.pi / 2)
        samples[index] *= factor
        samples[-1 - index] *= factor
    return samples
def progression_music_samples(duration):
    notes = (261.63, 329.63, 392., 523.25, 293.66, 369.99, 440., 587.33,
             329.63, 392., 493.88, 659.25, 293.66, 369.99, 440., 587.33)
    total = int(RATE * duration)
    samples = [0.] * total
    for note_index, frequency in enumerate(notes):
        start = note_index * duration / len(notes)
        length = duration / len(notes) * .92
        first = int(start * RATE)
        count = int(length * RATE)
        for offset in range(count):
            progress = offset / count
            shape = math.sin(math.pi * progress) ** 1.4
            time = offset / RATE
            value = math.sin(2 * math.pi * frequency * time) + .24 * math.sin(2 * math.pi * frequency * 2 * time)
            samples[(first + offset) % total] += value * shape * .075
    fade = int(RATE * .35)
    for index in range(fade):
        factor = math.sin((index / fade) * math.pi / 2)
        samples[index] *= factor
        samples[-1 - index] *= factor
    return samples
def ambience():
    d = 8.
    write_samples("weather-rain.wav", rain_samples(d))
    write("weather-sun.wav", d, lambda t: tone(t, 0, d, 196, .055) + tone(t, 0, d, 294, .035), True)
    write("weather-sand.wav", d, lambda t: noise(t, 0, d, .085) * (.65 + .35 * math.sin(2 * math.pi * .25 * t)), True)
    write("weather-snow.wav", d, lambda t: noise(t, 0, d, .026) + sum(tone(t, .35 + i * .71, .42, 900 + i * 47, .055, 1220 + i * 33) for i in range(8)), True)
    write_samples("terrain-electric.wav", electric_samples(d), .66)
    write_samples("terrain-grassy.wav", grassy_samples(d), .62)
    write("terrain-psychic.wav", d, lambda t: tone(t, 0, d, 220, .045) + tone(t, 0, d, 330, .038), True)
    write_samples("terrain-misty.wav", misty_samples(d), .58)
if __name__ == "__main__":
    short_effects(); ambience(); write_samples("progression-theme.wav", progression_music_samples(12.), .46)
    print(f"Generated 39 original sounds in {OUTPUT}")
