#!/usr/bin/env python3
"""Parche F-SEC-01: aplica guardPanel(req) a todas las mutaciones de panel.
Exenciones con autenticación propia: ping (fb-workers) y tick (scheduler),
claim/report de jobs y joins (HMAC), webhooks (firma propia)."""
import re, pathlib

ROOT = pathlib.Path('/home/z/my-project/src/app/api')
IMPORT = "import { guardPanel } from '@/lib/panel-auth';"
GUARD = "  const denied = guardPanel(req);\n  if (denied) return denied;\n"

# archivo -> handlers a cubrir (None = todos los POST/PATCH/DELETE)
TARGETS = {
    'fb-workers/route.ts': ('POST',),           # guard interno con excepción ping
    'fb-campaigns/route.ts': ('POST', 'PATCH'),
    'fb-groups/route.ts': ('POST', 'PATCH'),
    'fb-joins/route.ts': ('POST', 'PATCH'),
    'fb-media/route.ts': ('POST', 'DELETE'),
    'meta-policy/route.ts': ('POST',),
    'harness/route.ts': ('POST',),
    'approvals/route.ts': ('POST',),
    'scheduler/route.ts': ('POST',),            # guard ya insertado tras tick a mano
    'orchestrator/route.ts': ('POST',),
    'research/route.ts': ('POST',),
    'drafts/route.ts': ('POST', 'PATCH'),
    'community/route.ts': ('POST', 'PATCH'),
    'brands/route.ts': ('POST', 'PATCH'),
    'skills/route.ts': ('POST',),
    'errors/route.ts': ('PATCH',),
}

def add_import(text: str) -> str:
    if 'panel-auth' in text:
        return text
    lines = text.split('\n')
    last_import = max(i for i, l in enumerate(lines) if l.startswith('import '))
    lines.insert(last_import + 1, IMPORT)
    return '\n'.join(lines)

patched, skipped = [], []
for rel, handlers in TARGETS.items():
    f = ROOT / rel
    if not f.exists():
        skipped.append(f'{rel} (no existe)')
        continue
    text = f.read_text()
    if 'guardPanel' in text and rel != 'scheduler/route.ts':
        skipped.append(f'{rel} (ya parcheado)')
        continue
    orig = text
    text = add_import(text)
    for h in handlers:
        pat = re.compile(r'(export async function ' + h + r'\((?:req: NextRequest|req: Request)[^)]*\) \{\n)')
        if rel == 'fb-workers/route.ts':
            # guard después del parseo, excluyendo ping (HMAC propio)
            anchor = "  const body = JSON.parse(raw || '{}');\n"
            rep = anchor + "  // F-SEC-01: register/delete/set_session_age son mutaciones de panel; el ping tiene su propia autenticación HMAC.\n  if (body.action !== 'ping') {\n" + GUARD + "  }\n"
            if anchor in text and 'panel-auth' not in text.split(anchor)[1][:200]:
                text = text.replace(anchor, rep, 1)
                continue
        if rel == 'scheduler/route.ts':
            continue  # guard ya insertado manualmente tras el branch tick
        text = pat.sub(r'\1' + GUARD, text, count=1)
    if text != orig:
        f.write_text(text)
        patched.append(rel)
    else:
        skipped.append(f'{rel} (sin cambios)')

print('PARCHEADOS:', len(patched))
for p in patched: print('  +', p)
print('OMITIDOS:', len(skipped))
for s in skipped: print('  .', s)
