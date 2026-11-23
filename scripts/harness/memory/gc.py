"""Reads a --trace-gc log: the largest heap before any collection, and the largest heap a full collection left
(what is live). usage: gc.py <server.log> [<rss.txt>]"""
import re
import sys

line_re = re.compile(r'\[\d+:0x[0-9a-f]+\]\s+(\d+) ms: ([A-Za-z -]+?)(?: \(reduce\))? (\d+(?:\.\d+)?) \((\d+(?:\.\d+)?)\) -> (\d+(?:\.\d+)?) \((\d+(?:\.\d+)?)\) MB')
peak_before = peak_total = live_after = 0.0
at_peak = at_live = 0
majors = scavenges = 0
last_live = []
fatal = []
limit = ''
for line in open(sys.argv[1], errors='replace'):
    if line.startswith('HEAP LIMIT'):
        limit = line.strip()
    if 'FATAL ERROR' in line or 'heap out of memory' in line or 'Last few GCs' in line:
        fatal.append(line.strip()[:200])
    m = line_re.search(line)
    if not m:
        continue
    ms, kind, before, total_before, after, total_after = int(m[1]), m[2].strip(), float(m[3]), float(m[4]), float(m[5]), float(m[6])
    if before > peak_before:
        peak_before, at_peak = before, ms
    peak_total = max(peak_total, total_before, total_after)
    if 'Mark-Compact' in kind:
        majors += 1
        last_live.append((ms, after))
        if after > live_after:
            live_after, at_live = after, ms
    else:
        scavenges += 1

print(limit)
print(f'collections: {majors} full, {scavenges} young')
print(f'largest heap before a collection: {peak_before:.0f} MB (at {at_peak / 1000:.0f} s), largest heap committed: {peak_total:.0f} MB')
print(f'largest heap left by a full collection (live): {live_after:.0f} MB (at {at_live / 1000:.0f} s)')
print('live after the last five full collections: ' + ', '.join(f'{a:.0f}' for _, a in last_live[-5:]) + ' MB')
print('fatal lines: ' + (' | '.join(fatal[:4]) if fatal else 'none'))
if len(sys.argv) > 2:
    rss = [int(x.split()[1]) for x in open(sys.argv[2]) if len(x.split()) == 2 and x.split()[1].isdigit()]
    if rss:
        print(f'RSS: max {max(rss) / 1024:.0f} MB, last {rss[-1] / 1024:.0f} MB, {len(rss)} samples')
