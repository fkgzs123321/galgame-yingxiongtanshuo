// ════════════════════════════════════════════════════════════
// 引擎.js · 三个引擎的共享实现（面板与脚本共用这一份）
//
// ★ 为什么要有这个文件：
//   机制层的三个 .txt 是 EJS（给世界书用的），面板是前端 JS。
//   如果面板里再抄一份算法，两份实现必然漂移。
//   所以把核心算法抽成一个 ESM 模块，推到 CDN，面板 import 它。
//   —— 单一事实来源，一份代码两处用。
//
// 导出：
//   judge()      判定引擎 E3（单次判定）
//   levelCost()  成长 C1（等级成本）
//   applyFeed()  成长 C2（反哺回路）
//   canAfford()  成长 C3（资源门）
//   derive()     成长 C4（派生计算）
//   fight()      战斗引擎（回合循环）
//   summarize()  战斗摘要（给 AI 的唯一出口）
// ════════════════════════════════════════════════════════════

/* ── LCG：确定性伪随机。禁止 Math.random（同一回合重渲染必须同结果）── */
const A = 1664525, C = 1013904223, M = 4294967296;
export function lcgNext(seed) { return (A * seed + C) % M; }
export function lcgFloat(seed) { return lcgNext(seed) / M; }

/* ════════ 判定引擎 E3 ════════
   D = P − R
   P = Σ(状态值 × 权重) / Σ权重          ← 加权平均，权重归一化
   R = 动作基准 × 场景难度乘数 + 目标修正 + 阶段修正
   S = clamp(50 + D + 环境修正, 5, 95)
   V = LCG × 100   →  V < S 为成功
   ★ 档位由 D 与成败【联合】决定（原实现只取其一，会同时给出「大成功」和「失败」）
*/
export function judgePower(values = {}, weights = {}) {
  let 分子 = 0, 分母 = 0;
  for (const k in weights) {
    const w = Number(weights[k]) || 0;
    if (!w) continue;
    分子 += (Number(values[k]) || 0) * w;
    分母 += w;
  }
  return 分母 <= 0 ? 0 : 分子 / 分母;
}
export function judgeRequire(base = 50, diffMult = 1, targetMod = 0, stageMod = 0) {
  const m = Number(diffMult) > 0 ? Number(diffMult) : 1;
  return Number(base) * m + (Number(targetMod) || 0) + (Number(stageMod) || 0);
}
export function judgeTier(diff, success) {
  if (!success) return diff <= -30 ? '大失败' : '失败';
  if (diff >= 30) return '大成功';
  if (diff >= 10) return '成功';
  return '勉强';
}
export const 倍数 = { 大成功: 1.5, 成功: 1.0, 勉强: 0.6, 大失败: 2.0, 失败: 1.0 };

export function judge(cfg = {}) {
  const P = judgePower(cfg.values, cfg.weights);
  const R = judgeRequire(cfg.base, cfg.diffMult, cfg.targetMod, cfg.stageMod);
  const diff = P - R + (Number(cfg.envMod) || 0);
  const S = Math.max(5, Math.min(95, 50 + diff));
  const seed = Number(cfg.seed) || 20260916;
  const next = lcgNext(seed);
  const V = (next / M) * 100;
  const success = V < S;
  const tier = judgeTier(diff, success);
  return { 能力值: Math.round(P), 要求值: Math.round(R), 差值: Math.round(diff), 成功率: Math.round(S), 掷值: Math.round(V * 100) / 100, 结果: success ? '成功' : '失败', 档位: tier, 效果倍数: 倍数[tier], 新种子: next };
}

/* ════════ 成长引擎 C1-C4 ════════ */
// C1：等级成本 = k × 基数(等级) ÷ max(1, 效率)
export function levelBase(level, 类型) {
  const n = Math.max(1, Number(level) + 1);
  return 类型 === 'quadratic' ? (n * n) / 2 : n;
}
export function levelCost(cfg = {}, level = 0) {
  const k = Number(cfg.k) || 1;
  const eff = Math.max(1, Number(cfg.效率) || 1);
  return Math.max(1, Math.round((k * levelBase(level, cfg.类型)) / eff));
}
export function canLevelUp(cfg = {}, level = 0) {
  const lv = Number(level) || 0;
  const 极限 = Number(cfg.极限), 常规 = Number(cfg.常规上限);
  if (极限 > 0 && lv >= 极限) return { 可: false, 原因: '已达极限' };
  if (常规 > 0 && lv >= 常规 && !cfg.已解锁突破) return { 可: false, 原因: '需要突破' };
  return { 可: true };
}
// C2：源状态每 N 档 → 目标 +1
export function feedBack(level, 每N档) {
  return Math.floor((Number(level) || 0) / Math.max(1, Number(每N档) || 1));
}
export function applyFeed(table = [], values = {}, base = {}) {
  const out = { ...base };
  for (const r of table) {
    if (!r || !r.目标) continue;
    out[r.目标] = (Number(out[r.目标]) || 0) + feedBack(values[r.源], r.每N档);
  }
  return out;
}
export function nextFeed(level, 每N档) {
  const m = Math.max(1, Number(每N档) || 1);
  const 余 = Math.max(0, Number(level) || 0) % m;
  return 余 === 0 ? m : m - 余;
}
// C3：资源门
export function canAfford(需求表 = {}, 持有表 = {}) {
  const 缺 = [];
  for (const k in 需求表) {
    const n = Number(需求表[k]) || 0, h = Number(持有表[k]) || 0;
    if (h < n) 缺.push({ 名: k, 差: n - h });
  }
  return { 可以: 缺.length === 0, 缺 };
}
// C4：派生计算（只读，不写回状态）
export function derive(公式表 = [], 输入 = {}) {
  const out = {};
  for (const f of 公式表) {
    if (!f || !f.名) continue;
    let v = 0;
    for (const t of f.项 || []) v += (Number(输入[t.字段]) || 0) * (Number(t.系数) || 0);
    if (f.下限 !== undefined) v = Math.max(Number(f.下限), v);
    if (f.上限 !== undefined) v = Math.min(Number(f.上限), v);
    out[f.名] = f.取整 ? Math.round(v) : v;
  }
  return out;
}
export function rateFromDiff(diff, cfg = {}) {
  const 基准 = Number(cfg.基准) || 50, 斜率 = isNaN(Number(cfg.斜率)) ? 1 : Number(cfg.斜率);
  const 下 = isNaN(Number(cfg.下限)) ? 1 : Number(cfg.下限), 上 = isNaN(Number(cfg.上限)) ? 95 : Number(cfg.上限);
  return Math.max(下, Math.min(上, 基准 + (Number(diff) || 0) * 斜率));
}

/* ════════ 战斗引擎 ════════ */
export function strike(攻方, 守方, diff, rng, rate) {
  const 命中率 = rate(diff + (Number(攻方.命中加成) || 0) - (Number(守方.闪避加成) || 0), 攻方.命中);
  const 掷 = rng() * 100;
  if (掷 >= 命中率) return { 命中: false, 掷值: Math.round(掷 * 100) / 100, 命中率, 伤害: 0 };
  const 基础 = (Number(攻方.攻击) || 0) - (Number(守方.防御) || 0);
  const 伤害 = Math.max(1, Math.round(基础 * (Number(攻方.伤害倍率) || 1)));
  return { 命中: true, 掷值: Math.round(掷 * 100) / 100, 命中率, 伤害 };
}
const 克隆 = (o) => ({ ...(o || {}) });

export function fight(cfg = {}, rng, rate) {
  const 我 = 克隆(cfg.我方), 敌 = 克隆(cfg.对方);
  const 上限 = Number(cfg.上限回合) || 50;
  let 回合 = 0; const 日志 = [];
  while (我.生命 > 0 && 敌.生命 > 0 && 回合 < 上限) {
    回合++;
    const 我先 = (Number(我.出手值) || 0) >= (Number(敌.出手值) || 0);
    const 顺序 = 我先 ? [[我, 敌, '我方'], [敌, 我, '对方']] : [[敌, 我, '对方'], [我, 敌, '我方']];
    const 本条 = { 回合, 动作: [] };
    for (const [a, b, 谁] of 顺序) {
      if (a.生命 <= 0 || b.生命 <= 0) continue;
      if ((Number(a.呆若木鸡) || 0) > 0) { a.呆若木鸡--; 本条.动作.push({ 谁, 跳过: true, 原因: '受控' }); continue; }
      const diff = (Number(a.总评) || 0) - (Number(b.总评) || 0);
      const 次 = strike(a, b, diff, rng, rate);
      if (次.命中) {
        b.生命 = Math.max(0, b.生命 - 次.伤害);
        if (cfg.计有效值) b.有效值 = Math.max(0, (Number(b.有效值) || 100) - Math.round(次.伤害 / Math.max(1, Number(b.上限) || 1) * 100));
      }
      本条.动作.push({ 谁, 跳过: false, ...次, 目标剩余: b.生命 });
      if (b.生命 <= 0) break;
    }
    日志.push(本条);
  }
  let 胜者 = 我.生命 <= 0 && 敌.生命 <= 0 ? '同归' : 敌.生命 <= 0 ? '我方' : 我.生命 <= 0 ? '对方' : '未决';
  const 伤档 = (剩, 上) => { const p = (Number(上) || 1) <= 0 ? 0 : (Number(剩) || 0) / Number(上) * 100; return p <= 0 ? '倒下' : p < 20 ? '濒死' : p < 50 ? '重伤' : p < 80 ? '轻伤' : '安然'; };
  let 结果 = 胜者;
  if (胜者 === '我方' || 胜者 === '对方') 结果 = 胜者 + (回合 <= 3 ? '·碾压' : 回合 <= 8 ? '·常规' : '·苦战');
  else if (胜者 === '未决') 结果 = '僵持（打满上限，双方都没倒）';
  const 我p = 伤档(我.生命, cfg.我方.上限), 敌p = 伤档(敌.生命, cfg.对方.上限);
  const 不可逆 = [];
  const 我掉 = (Number(cfg.我方.有效值) || 100) - (Number(我.有效值) || 100);
  const 敌掉 = (Number(cfg.对方.有效值) || 100) - (Number(敌.有效值) || 100);
  if (我掉 > 0) 不可逆.push('我方受伤 ' + Math.round(我掉) + '%');
  if (敌掉 > 0) 不可逆.push('对方受伤 ' + Math.round(敌掉) + '%');
  const 约束 = [];
  if (结果.includes('碾压')) 约束.push('快而不费力，过程短，不必写拉锯');
  if (结果.includes('苦战')) 约束.push('必须写出耗与险，双方都到过危险处');
  if (结果.includes('僵持')) 约束.push('以未分胜负收场，谁也没占到便宜，留出下一次');
  if (结果.includes('同归')) 约束.push('两败俱伤，双方都倒下');
  if (敌p === '倒下') 约束.push('对方倒下这一下要写实，不能一笔带过');
  if (我p === '濒死' || 我p === '倒下') 约束.push('我方到了极限，身体上的代价必须落在正文里');
  return {
    胜者, 回合数: 回合, 我方剩余: 我.生命, 对方剩余: 敌.生命, 日志,
    摘要: { 结果, 回合数: 回合, 我方状态: 我p + '（剩 ' + Math.round(我.生命) + '/' + Math.round(Number(cfg.我方.上限) || 0) + '）',
      对方状态: 敌p + '（剩 ' + Math.round(敌.生命) + '/' + Math.round(Number(cfg.对方.上限) || 0) + '）', 不可逆, 写法约束: 约束 },
  };
}

/* ════════ NPC 参战派生（从战力档位推）════════
   ★ 这是**标定**，不是原作数据 —— 原作只给了「战力」一个数。
   映射的依据是让档位与武功等级大致对齐（100 档 ≈ 三十级，1000 档 ≈ 一百一十级）。
*/
export const 档位表 = [
  { 战力: 10, 总评: 5, 生命: 110, 攻击: 6, 防御: 1 },
  { 战力: 100, 总评: 30, 生命: 200, 攻击: 17, 防御: 6 },
  { 战力: 300, 总评: 60, 生命: 400, 攻击: 41, 防御: 18 },
  { 战力: 500, 总评: 80, 生命: 600, 攻击: 65, 防御: 30 },
  { 战力: 1000, 总评: 110, 生命: 1100, 攻击: 125, 防御: 60 },
  { 战力: 1500, 总评: 130, 生命: 1600, 攻击: 185, 防御: 90 },
  { 战力: 10000, 总评: 200, 生命: 10100, 攻击: 1205, 防御: 600 },
  { 战力: 30000, 总评: 240, 生命: 30100, 攻击: 3605, 防御: 1800 },
  { 战力: 50000, 总评: 255, 生命: 50100, 攻击: 6005, 防御: 3000 },
];
export function 参战(cfg = {}) {
  const w = Number(cfg.战力) || 100;
  let 档 = 档位表[0];
  for (const d of 档位表) if (w >= d.战力) 档 = d;
  return { 总评: 档.总评, 生命: 档.生命, 上限: 档.生命, 攻击: 档.攻击, 防御: 档.防御, 出手值: 档.总评, 有效值: 100 };
}
