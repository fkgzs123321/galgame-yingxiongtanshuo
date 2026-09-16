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
    胜者, 回合数: 回合, 我方剩余: 我.生命, 对方剩余: 敌.生命,
    我方有效值: 我.有效值, 对方有效值: 敌.有效值, 日志,
    摘要: { 结果, 回合数: 回合, 我方状态: 我p + '（剩 ' + Math.round(我.生命) + '/' + Math.round(Number(cfg.我方.上限) || 0) + '）',
      对方状态: 敌p + '（剩 ' + Math.round(敌.生命) + '/' + Math.round(Number(cfg.对方.上限) || 0) + '）', 不可逆, 写法约束: 约束 },
  };
}

/* ════════ C5 · 解锁条件（多条件联合）════════
   「两样东西同时到某个级数，第三样才出现」——
   它不是状态，是一个判定；结果不是数值，是「能不能用」。
*/
export function entrance(条件表 = [], 值表 = {}) {
  const 已解锁 = [], 未解锁 = [];
  for (const r of 条件表) {
    if (!r || !r.名) continue;
    const 缺 = [];
    for (const 项 of r.需要 || []) {
      const 现 = Number(值表[项.字段]) || 0, 要 = Number(项.至少) || 0;
      if (现 < 要) 缺.push({ 字段: 项.字段, 现, 需: 要 });
    }
    if (缺.length) 未解锁.push({ 名: r.名, 缺 }); else 已解锁.push(r.名);
  }
  return { 已解锁, 未解锁 };
}
export function unlocked(条件表, 名, 值表) { return entrance(条件表, 值表).已解锁.includes(名); }
export function 距解锁(条件表 = [], 名, 值表 = {}) {
  for (const r of 条件表) {
    if (r.名 !== 名) continue;
    return (r.需要 || []).filter((x) => (Number(值表[x.字段]) || 0) < Number(x.至少))
      .map((x) => x.字段 + ' 还差 ' + (Number(x.至少) - (Number(值表[x.字段]) || 0)) + ' 级');
  }
  return [];
}

/* ════════ E7 装备与背包 ════════ */
export function equip(穿着表 = {}, 槽, 物) {
  if (!(槽 in 穿着表)) return { 可以: false, 原因: '没有这个槽位' };
  const 旧 = 穿着表[槽];
  穿着表[槽] = 物;
  return { 可以: true, 换下: 旧, 现在: 物 };
}
export function equipBonus(穿着表 = {}, 物表 = {}, 品质倍率 = {}) {
  const out = {};
  for (const 槽 in 穿着表) {
    const o = 物表[穿着表[槽]];
    if (!o) continue;
    const m = Number(品质倍率[o.品质]) || 1;
    for (const k in (o.加成 || {})) out[k] = (Number(out[k]) || 0) + (Number(o.加成[k]) || 0) * m;
  }
  return out;
}
export function 装备后输入(基础值表 = {}, 穿着表, 物表, 档位表 = []) {
  const out = { ...基础值表 };
  const 倍 = {};
  for (const x of 档位表) 倍[x.名] = Number(x.倍率) || 1;
  const 加 = equipBonus(穿着表, 物表, 倍);
  for (const k in 加) out[k] = (Number(out[k]) || 0) + 加[k];
  return out;
}
export function consume(资源表 = {}, 物 = {}, 次数 = 1) {
  const n = Math.max(1, Number(次数) || 1);
  for (const k in (物.效果 || {})) {
    资源表[k] = (Number(资源表[k]) || 0) + (Number(物.效果[k]) || 0) * n;
    const 上 = (物.上限 || {})[k];
    if (上 !== undefined) 资源表[k] = Math.min(Number(上), 资源表[k]);
  }
  return { 用掉: n, 现在: 资源表 };
}
export function 低于门槛(资源表 = {}, 门槛表 = {}) {
  const 触发 = Object.keys(门槛表).filter((k) => (Number(资源表[k]) || 0) < (Number(门槛表[k]) || 0));
  return { 触发, 有没有: 触发.length > 0 };
}
export function canHold(背包 = [], 容量 = 0) {
  const 容 = Number(容量) || 0;
  if (容 <= 0) return { 可以: true, 剩余: 9999 };
  return { 可以: 背包.length < 容, 剩余: Math.max(0, 容 - 背包.length) };
}
export function putIn(背包 = [], 物, 容量) {
  const r = canHold(背包, 容量);
  if (!r.可以) return { 可以: false, 原因: '装不下了', 剩余: 0 };
  背包.push(物);
  return { 可以: true, 剩余: r.剩余 - 1 };
}
export function takeOut(背包 = [], 物) {
  const i = 背包.indexOf(物);
  if (i < 0) return { 可以: false, 原因: '身上没有' };
  背包.splice(i, 1);
  return { 可以: true };
}
export function hasItem(背包 = [], 物) { return 背包.indexOf(物) >= 0; }

/* ════════ E8 品质与掉落 ════════ */
export function 品质倍率(档位表 = [], 名) {
  for (const x of 档位表) if (x.名 === 名) return Number(x.倍率) || 1;
  return 1;
}
export function dropTable(档位表 = [], 修正, 值表 = {}, rng) {
  let 加 = 0;
  if (修正) {
    加 = (Number(值表[修正.影响字段]) || 0) * (Number(修正.每点权重) || 0);
    if (修正.上限 !== undefined) 加 = Math.min(Number(修正.上限), 加);
  }
  const 权 = [];
  let 总 = 0;
  档位表.forEach((x, i) => {
    let w = Number(x.权重) || 0;
    if (i > 0) w = w * (1 + 加);          // 修正只抬高高档
    权.push(w); 总 += w;
  });
  if (总 <= 0) return null;
  const 掷 = rng() * 总;
  let 累 = 0;
  for (let i = 0; i < 权.length; i++) { 累 += 权[i]; if (掷 < 累) return 档位表[i].名; }
  return 档位表[档位表.length - 1].名;
}
export function 强化(物 = {}, 层数 = 0, cfg = {}) {
  const 上限 = Number(cfg.上限) || 10, 每层 = Number(cfg.每层倍率) || 0.1;
  const n = Math.min(上限, Math.max(0, Number(层数) || 0));
  const out = {};
  for (const k in (物.加成 || {})) out[k] = (Number(物.加成[k]) || 0) * (1 + 每层 * n);
  return { 层数: n, 加成: out, 满没满: n >= 上限 };
}
export function 合成(材料表 = {}, 配方 = {}) {
  const 缺 = Object.keys(配方.需要 || {}).filter((k) => (Number(材料表[k]) || 0) < Number(配方.需要[k]));
  if (缺.length) return { 可以: false, 缺 };
  for (const k in 配方.需要) 材料表[k] = (Number(材料表[k]) || 0) - Number(配方.需要[k]);
  return { 可以: true, 得到: 配方.产出, 剩余: 材料表 };
}

/* ════════ E13 持续状态（增益/减益 + 冷却）════════
   跨题材压力测试测出来的最宽通用面：武侠的毒、仙侠的丹毒、
   火影的幻术、魔兽的光环、哈利波特的昏昏倒地 —— 全是这一个机制。
*/
export function 挂上(身上 = {}, 定义 = {}) {
  if (!定义.id) return { 可以: false, 原因: '没有这个状态' };
  const 上限 = Number(定义.层数上限) || 1;
  const 条 = 身上[定义.id];
  if (条) {
    条.层 = Math.min(上限, (Number(条.层) || 1) + 1);
    条.剩 = Number(定义.时长) || 条.剩;
    return { 可以: true, 叠到: 条.层, 剩: 条.剩 };
  }
  身上[定义.id] = { 名: 定义.名 || 定义.id, 类型: 定义.类型 || '减益', 剩: Number(定义.时长) || 1, 层: 1 };
  return { 可以: true, 挂上: 定义.id, 剩: 身上[定义.id].剩 };
}
export function 撤掉(身上 = {}, id) {
  if (!(id in 身上)) return { 可以: false, 原因: '身上没有这个状态' };
  delete 身上[id];
  return { 可以: true, 撤了: id };
}
export function 有没有(身上 = {}, id) { return !!身上[id]; }
export function 几层(身上 = {}, id) { const 条 = 身上[id]; return 条 ? (Number(条.层) || 1) : 0; }
export function 过一回合(身上 = {}, 定义表 = [], 值表 = {}) {
  const 定 = {}; for (const x of 定义表) 定[x.id] = x;
  const 报 = { 结算: [], 到期: [] };
  for (const id in 身上) {                       // ① 先结算每回合作用
    const 条 = 身上[id], d = 定[id] || {}, 层 = Number(条.层) || 1;
    for (const k in (d.每回合 || {})) {
      const 量 = (Number(d.每回合[k]) || 0) * 层;
      值表[k] = (Number(值表[k]) || 0) + 量;
      报.结算.push({ 状态: id, 字段: k, 量 });
    }
  }
  for (const id in 身上) {                       // ② 再减时长（反了会「刚挂上就咬一口」）
    const 条 = 身上[id];
    if (条.剩 !== undefined) 条.剩 = (Number(条.剩) || 0) - 1;
    if (Number(条.剩) <= 0) { 报.到期.push(id); delete 身上[id]; }
  }
  return 报;
}
export function 状态倍率(身上 = {}, 定义表 = []) {
  const 定 = {}; for (const x of 定义表) 定[x.id] = x;
  const 倍 = {};
  for (const id in 身上) {
    const d = 定[id] || {}, 层 = Number(身上[id].层) || 1;
    for (const k in (d.改派生 || {})) {
      const m = 1 + ((Number(d.改派生[k]) || 1) - 1) * 层;
      倍[k] = (Number(倍[k]) || 1) * m;
    }
  }
  return 倍;
}
export function 应用倍率(派生值 = {}, 倍率 = {}) {
  const 出 = {};
  for (const k in 派生值) { const m = Number(倍率[k]); 出[k] = (Number(派生值[k]) || 0) * (isNaN(m) ? 1 : m); }
  return 出;
}
export function 概率修正(身上 = {}, 定义表 = []) {
  const 定 = {}; for (const x of 定义表) 定[x.id] = x;
  let 加 = 0;
  for (const id in 身上) 加 += (Number((定[id] || {}).改概率) || 0) * (Number(身上[id].层) || 1);
  return 加;
}
export function 进冷却(身上 = {}, 技能id, 回合数) {
  return 挂上(身上, { id: '__cd_' + 技能id, 名: '冷却：' + 技能id, 类型: '减益', 时长: Number(回合数) || 1 });
}
export function 在冷却(身上 = {}, 技能id) { return 有没有(身上, '__cd_' + 技能id); }
export function 冷却剩(身上 = {}, 技能id) { const 条 = 身上['__cd_' + 技能id]; return 条 ? (Number(条.剩) || 0) : 0; }
export function 状态快照(身上 = {}) {
  const 行 = [];
  for (const id in 身上) {
    if (String(id).indexOf('__cd_') === 0) continue;
    const 条 = 身上[id];
    行.push(条.名 + (Number(条.层) > 1 ? '×' + 条.层 : '') + '(' + 条.剩 + ')');
  }
  return 行.join('　');
}

/* ════════ E14 相克关系（矩阵）════════ */
export function 相克(矩 = {}, 攻方, 守方) {
  let 默 = Number(矩.默认); if (isNaN(默)) 默 = 1;
  if (矩.值) { const 行 = 矩.值[攻方]; return (行 && 行[守方] !== undefined) ? (Number(行[守方]) || 默) : 默; }
  for (const x of (矩.表 || [])) if (x.攻 === 攻方 && x.守 === 守方) return Number(x.倍率) || 默;
  return 默;
}
export function 相克全表(矩 = {}, 键表) {
  const 键 = 键表 || 矩.键 || [], 出 = [];
  for (let i = 0; i < 键.length; i++) for (let j = 0; j < 键.length; j++) {
    if (i === j) continue;
    出.push({ 攻: 键[i], 守: 键[j], 倍率: 相克(矩, 键[i], 键[j]) });
  }
  return 出;
}
export function 克我的(矩, 键表, 我) { return 相克全表(矩, 键表).filter((x) => x.守 === 我 && x.倍率 > 1).map((x) => x.攻); }
export function 我克的(矩, 键表, 我) { return 相克全表(矩, 键表).filter((x) => x.攻 === 我 && x.倍率 > 1).map((x) => x.守); }
export function 相克自检(矩 = {}, 键表) {
  const 键 = 键表 || 矩.键 || [];
  const 错 = 键.filter((k) => Math.abs(相克(矩, k, k) - 1) > 1e-9).map((k) => ({ 键: k, 自克: 相克(矩, k, k) }));
  return { 有没有错: 错.length > 0, 错 };
}

/* ════════ C7 施展条件与代价（「会」和「能用」是两件事）════════ */
export function 能学吗(定义 = {}) {
  return 定义.先天 ? { 可以: false, 原因: '这个学不了，是天生的' } : { 可以: true };
}
export function 能用吗(定义 = {}, 值表 = {}, 身上 = {}) {
  const 缺 = [];
  for (const c of (定义.条件 || [])) {
    if (c.类型 === '有状态') { if (!身上[c.状态]) 缺.push('要处在「' + c.状态 + '」里才能用'); }
    else if (c.类型 === '没状态') { if (身上[c.状态]) 缺.push('带着「' + c.状态 + '」时用不了'); }
    else if (c.类型 === '资源够' || c.类型 === '字段够') {
      const 现 = Number(值表[c.字段]) || 0, 要 = Number(c.至少) || 0;
      if (现 < 要) 缺.push(c.字段 + ' 还差 ' + (要 - 现));
    }
  }
  return { 可以: 缺.length === 0, 缺 };
}
export function 用得起吗(定义 = {}, 值表 = {}) {
  const 缺 = [];
  for (const k in (定义.代价 || {})) {
    const 现 = Number(值表[k]) || 0, 要 = Number(定义.代价[k]) || 0;
    if (现 < 要) 缺.push({ 字段: k, 现, 需: 要 });
  }
  return { 可以: 缺.length === 0, 缺 };
}
export function 放得出吗(定义 = {}, 值表 = {}, 身上 = {}) {
  const 能 = 能用吗(定义, 值表, 身上);
  if (!能.可以) return { 可以: false, 因为: '条件不到', 缺: 能.缺 };
  const 付 = 用得起吗(定义, 值表);
  if (!付.可以) return { 可以: false, 因为: '付不起代价', 缺: 付.缺.map((x) => x.字段 + ' 还差 ' + (x.需 - x.现)) };
  return { 可以: true };
}
export function 付代价(定义 = {}, 值表 = {}) {
  const r = 用得起吗(定义, 值表);
  if (!r.可以) return r;
  for (const k in (定义.代价 || {})) 值表[k] = (Number(值表[k]) || 0) - Number(定义.代价[k]);
  return { 可以: true, 扣了: 定义.代价 };
}
export function 施展(定义 = {}, 值表 = {}, 身上 = {}, 冷却回合) {
  const r = 放得出吗(定义, 值表, 身上);
  if (!r.可以) return r;
  付代价(定义, 值表);
  if (冷却回合) 进冷却(身上, 定义.id, 冷却回合);
  return { 可以: true, 放了: 定义.id };
}

/* ════════ C6-b 改图（玩家自定义生成 · 参考色色灵感状态栏的天赋树）════════
   ★★ 顺序不能错：校验 → 算代价 → 付得起吗 → 改副本 → 落盘成功 → 才扣代价
   反过来会出现「钱扣了但图没改成功」—— 那是事务错，不是算术错。
*/
export function 校验改动(图 = {}, 改动 = {}) {
  const n = 图.节点 || [], d = 改动;
  const 有 = {}; for (const x of n) 有[x.id] = x;
  if (d.动作 === '加节点') {
    if (!d.节点 || !d.节点.id) return { 合法: false, 原因: '没给节点' };
    if (有[d.节点.id]) return { 合法: false, 原因: '这个 id 已经有了' };
    for (const x of (d.节点.前置 || [])) if (!有[x] && x !== d.节点.id) return { 合法: false, 原因: '前置不存在：' + x };
    return { 合法: true };
  }
  if (d.动作 === '删节点') {
    if (!有[d.id]) return { 合法: false, 原因: '没有这个节点' };
    const 靠 = n.filter((x) => (x.前置 || []).indexOf(d.id) >= 0).map((x) => x.id);
    if (靠.length) return { 合法: false, 原因: '还有东西依赖它', 依赖: 靠 };
    return { 合法: true };
  }
  if (d.动作 === '改门槛') {
    if (!有[d.id]) return { 合法: false, 原因: '没有这个节点' };
    return { 合法: true };
  }
  return { 合法: false, 原因: '不认这个动作：' + d.动作 };
}
export function 算改动代价(改动 = {}, 代价表 = {}, 已改次数 = 0) {
  const 基 = (代价表.动作 || {})[改动.动作] || {};
  const 倍 = 1 + (Number(代价表.每次递增) || 0) * (Number(已改次数) || 0);
  const 出 = {};
  for (const k in 基) 出[k] = Math.ceil((Number(基[k]) || 0) * 倍);
  return 出;
}
export function 落图(图 = {}, 改动 = {}) {
  const 新 = JSON.parse(JSON.stringify(图.节点 ? 图 : { 节点: [] }));
  const n = 新.节点;
  if (改动.动作 === '加节点') { n.push(改动.节点); return { 可以: true, 图: 新 }; }
  if (改动.动作 === '删节点') { const i = n.findIndex((x) => x.id === 改动.id); if (i >= 0) n.splice(i, 1); return { 可以: true, 图: 新 }; }
  if (改动.动作 === '改门槛') { const x = n.find((y) => y.id === 改动.id); if (x) x.需要 = 改动.需要 || x.需要; return { 可以: true, 图: 新 }; }
  return { 可以: false, 原因: '不认这个动作' };
}
export function 改图(图 = {}, 改动 = {}, 代价表 = {}, 值表 = {}, 已改次数 = 0) {
  const 校 = 校验改动(图, 改动);
  if (!校.合法) return { 可以: false, 在哪一步: '校验', 原因: 校.原因, 依赖: 校.依赖 };
  const 代 = 算改动代价(改动, 代价表, 已改次数);
  const 付 = canAfford(代, 值表);
  if (!付.可以) return { 可以: false, 在哪一步: '付代价', 缺: 付.缺, 要: 代 };
  const 落 = 落图(图, 改动);                       // ★ 先在副本上落盘
  if (!落.可以) return { 可以: false, 在哪一步: '落盘', 原因: 落.原因 };
  for (const k in 代) 值表[k] = (Number(值表[k]) || 0) - Number(代[k]);   // 落盘成功才扣
  const 环 = 有没有环(落.图);                      // ★ 落盘后自检，坏了就退费
  if (环.有环) {
    for (const k in 代) 值表[k] = (Number(值表[k]) || 0) + Number(代[k]);
    return { 可以: false, 在哪一步: '自检', 原因: '改完出现环，费用已退回', 环在: 环.在哪 };
  }
  return { 可以: true, 图: 落.图, 花了: 代, 改了几次: (Number(已改次数) || 0) + 1 };
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
