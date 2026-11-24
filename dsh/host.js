import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Canvas only needs the Skill registry: the renderer itself lives in the Client half.
export const inject = [];

const dshDir = dirname(fileURLToPath(import.meta.url));
const skillDir = join(dshDir, 'skills', 'allwise-canvas');
const skillBody = join(skillDir, 'SKILL.md');

const DESCRIPTION = '在对话窗口里直接画出可交互的图形、流程图、看板'
  + '（allwise-flow / allwise-html / allwise-svg）。当用户要求画流程、画图、可视化、'
  + '展示步骤、对比方案或做卡片时使用。';

export function apply(ctx) {
  const skills = ctx.get?.('skills');
  if (!skills) return;

  const entry = {
    name: 'allwise-canvas',
    description: DESCRIPTION,
    invocation: { modelInvocable: true, userInvocable: true },
    provider: 'allwise-canvas',
    source: 'bundled',
    // The registry rejects a non-numeric rank; bundled providers use the standard 600.
    rank: 600,
    resourceBase: { kind: 'directory', path: skillDir },
    locator: skillBody,
  };

  const provider = {
    name: 'allwise-canvas',
    async list() {
      if (!existsSync(skillBody)) return { candidates: [], complete: true };
      return { candidates: [entry], complete: true };
    },
    // loadSkill() reads the body through provider.get(); listing alone is not enough.
    async get(candidate) {
      if (candidate.name !== entry.name) return undefined;
      const content = await readFile(skillBody, 'utf8').catch(() => undefined);
      if (content === undefined) return undefined;
      return { ...entry, content };
    },
  };

  ctx.effect(() => skills.registerProvider(() => provider));
}
