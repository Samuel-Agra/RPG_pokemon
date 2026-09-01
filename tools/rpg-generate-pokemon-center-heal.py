"""Generate the original Pokemon Center recovery chime used by the RPG."""

import math
import random
import struct
import wave
from pathlib import Path

SAMPLE_RATE = 44_100
DURATION = 0.95
OUTPUT = Path(__file__).parents[1] / "server/static/rpg/assets/audio/pokemon-center-heal.wav"


def envelope(time: float, start: float, length: float, attack: float = 0.018) -> float:
	position = time - start
	if position < 0 or position >= length:
		return 0.0
	return min(1.0, position / attack) * math.exp(-4.2 * position / length)


def bell(time: float, start: float, frequency: float, length: float, volume: float) -> float:
	position = time - start
	amp = envelope(time, start, length)
	if not amp:
		return 0.0
	return volume * amp * (
		math.sin(2 * math.pi * frequency * position) * 0.68
		+ math.sin(2 * math.pi * frequency * 2.01 * position) * 0.22
		+ math.sin(2 * math.pi * frequency * 3.98 * position) * 0.10
	)


random.seed(20260901)
notes = [
	(0.03, 783.99, 0.55, 0.40),
	(0.43, 1046.50, 0.50, 0.42),
]

frames = bytearray()
for sample_index in range(round(SAMPLE_RATE * DURATION)):
	time = sample_index / SAMPLE_RATE
	value = sum(bell(time, *note) for note in notes)
	value = math.tanh(value * 1.1) * 0.82
	left = int(max(-1, min(1, value * (0.98 + 0.02 * math.sin(time * 5)))) * 32767)
	right = int(max(-1, min(1, value * (0.98 - 0.02 * math.sin(time * 5)))) * 32767)
	frames.extend(struct.pack("<hh", left, right))

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
with wave.open(str(OUTPUT), "wb") as output:
	output.setnchannels(2)
	output.setsampwidth(2)
	output.setframerate(SAMPLE_RATE)
	output.writeframes(frames)

print(OUTPUT)
