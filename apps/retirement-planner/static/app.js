// 淨資產退休試算器 — 前端
"use strict";

const state = {
  plans: [],
  currentPlan: null,
  currentYearId: null,
};

// --------------------------- Utilities ---------------------------

const fmt = (n, digits = 1) =>
  (n == null || isNaN(n) ? "—"
    : Number(n).toLocaleString("zh-TW", {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits === 0 ? 0 : 0,
      }));

const fmtPct = (r) => (r == null || isNaN(r) ? "—" : `${(r * 100).toFixed(2)}%`);

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`${res.status} ${await res.text()}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

let saveTimer = null;
function debouncedSave(fn) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(fn, 350);
}

// --------------------------- Bootstrapping ---------------------------

async function loadPlans() {
  state.plans = await api("/api/plans");
  const select = document.getElementById("plan-select");
  select.innerHTML = "";
  for (const p of state.plans) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    select.appendChild(opt);
  }
  if (state.plans.length === 0) {
    state.currentPlan = null;
    renderEditor();
    return;
  }
  const current = state.currentPlan?.id;
  const target = state.plans.find((p) => p.id === current) ?? state.plans[0];
  select.value = target.id;
  await loadPlan(target.id);
}

async function loadPlan(planId) {
  state.currentPlan = await api(`/api/plans/${planId}`);
  document.getElementById("plan-target").value =
    state.currentPlan.target_amount;
  if (state.currentPlan.years.length > 0 &&
      !state.currentPlan.years.find((y) => y.id === state.currentYearId)) {
    state.currentYearId = state.currentPlan.years[0].id;
  } else if (state.currentPlan.years.length === 0) {
    state.currentYearId = null;
  }
  renderYearList();
  renderEditor();
}

// --------------------------- Year sidebar ---------------------------

function renderYearList() {
  const ul = document.getElementById("year-list");
  ul.innerHTML = "";
  if (!state.currentPlan) return;
  for (const y of state.currentPlan.years) {
    const li = document.createElement("li");
    li.className = "year-item" + (y.id === state.currentYearId ? " active" : "");
    li.innerHTML = `
      <div>
        <div class="y-label">${y.year}</div>
        <div class="y-value">淨資產 ${fmt(y.computed.end_net_worth)} 萬</div>
      </div>
      <button class="y-delete" title="刪除">✕</button>
    `;
    li.addEventListener("click", () => {
      state.currentYearId = y.id;
      renderYearList();
      renderEditor();
    });
    li.querySelector(".y-delete").addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm(`確定刪除 ${y.year} 年？`)) return;
      await api(`/api/years/${y.id}`, { method: "DELETE" });
      await loadPlan(state.currentPlan.id);
    });
    ul.appendChild(li);
  }
}

// --------------------------- Editor ---------------------------

function renderEditor() {
  const root = document.getElementById("editor");
  if (!state.currentPlan) {
    root.innerHTML = `<div class="empty-hint">尚未建立任何計畫</div>`;
    return;
  }
  if (!state.currentYearId) {
    root.innerHTML = `<div class="empty-hint">請點擊左側「＋」新增年度</div>`;
    return;
  }
  const y = state.currentPlan.years.find((x) => x.id === state.currentYearId);
  if (!y) {
    root.innerHTML = `<div class="empty-hint">年度資料不存在</div>`;
    return;
  }
  const c = y.computed;

  root.innerHTML = `
    <h2>📅 ${y.year} 年度</h2>

    <div class="section">
      <h3><span class="icon">💰</span>收入與投資 <span style="color:var(--text-dim);font-size:12px;font-weight:400;">(單位：萬)</span></h3>
      <div class="grid-2">
        <div class="field"><label>年收入 (萬)</label>
          <input type="number" step="1" data-y="annual_income" value="${y.annual_income}"></div>
        <div class="field"><label>年初投資部位 (萬)</label>
          <input type="number" step="1" data-y="investment" value="${y.investment}"></div>
        <div class="field"><label>年初淨資產 (萬)</label>
          <input type="number" step="1" data-y="net_worth" value="${y.net_worth}"></div>
        <div class="field"><label>報酬率 (%)</label>
          <input type="number" step="0.1" data-y-pct="return_rate" value="${(y.return_rate * 100).toFixed(2)}"></div>
        <div class="field"><label>質押利率 (%)</label>
          <input type="number" step="0.1" data-y-pct="pledge_rate" value="${(y.pledge_rate * 100).toFixed(2)}"></div>
        <div class="field"><label>理財型利率 (%)</label>
          <input type="number" step="0.1" data-y-pct="finance_rate" value="${(y.finance_rate * 100).toFixed(2)}"></div>
      </div>
    </div>

    <div class="section">
      <h3><span class="icon">📉</span>月支出項目 <span style="color:var(--text-dim);font-size:12px;font-weight:400;">每項可設定生效月份數，預設 12</span></h3>
      <div class="expense-table" id="monthly-table">
        <div class="expense-row header">
          <div>項目</div>
          <div style="text-align:right">金額 (萬/月)</div>
          <div style="text-align:right">月份數</div>
          <div style="text-align:right">小計</div>
          <div></div>
        </div>
        ${y.monthly_expenses.map(renderMonthlyRow).join("")}
      </div>
      <button class="add-row-btn" data-add="monthly">＋ 新增月支出項目</button>
      <div class="expense-totals">
        月支出年化合計 <strong>${fmt(c.monthly_total)} 萬</strong>
      </div>
    </div>

    <div class="section">
      <h3><span class="icon">🏗️</span>年度固定支出</h3>
      <div class="expense-table" id="annual-table">
        <div class="expense-row header" style="grid-template-columns:1.5fr 1fr 1fr auto auto;">
          <div>項目</div>
          <div style="text-align:right">金額 (萬/年)</div>
          <div></div>
          <div></div>
          <div></div>
        </div>
        ${y.annual_expenses.map(renderAnnualRow).join("")}
      </div>
      <button class="add-row-btn" data-add="annual">＋ 新增年度固定支出</button>
      <div class="expense-totals">
        年度固定合計 <strong>${fmt(c.annual_total)} 萬</strong>
        ・ 全年總支出 <strong>${fmt(c.total_expenses)} 萬</strong>
      </div>
    </div>

    <div class="section">
      <h3><span class="icon">📊</span>即時計算</h3>
      <div class="computed-cards">
        <div class="card"><div class="label">年報酬</div>
          <div class="value positive">${fmt(c.annual_return)} 萬</div></div>
        <div class="card"><div class="label">質押成本</div>
          <div class="value negative">${fmt(c.pledge_cost)} 萬</div></div>
        <div class="card"><div class="label">理財型收益</div>
          <div class="value positive">${fmt(c.finance_income)} 萬</div></div>
        <div class="card"><div class="label">淨現金流</div>
          <div class="value ${c.net_cash_flow >= 0 ? "positive" : "negative"}">
          ${fmt(c.net_cash_flow)} 萬</div></div>
        <div class="card"><div class="label">年末投資部位</div>
          <div class="value">${fmt(c.end_investment)} 萬</div></div>
        <div class="card"><div class="label">年末淨資產</div>
          <div class="value">${fmt(c.end_net_worth)} 萬</div></div>
      </div>
    </div>

    <div class="section">
      <h3><span class="icon">📝</span>備註</h3>
      <div class="field"><textarea data-y="notes" placeholder="本年度備註">${y.notes || ""}</textarea></div>
    </div>
  `;

  bindEditor(y);
}

function renderMonthlyRow(item) {
  const subtotal = (item.amount || 0) * (item.months || 0);
  return `
    <div class="expense-row" data-monthly-id="${item.id}">
      <input type="text" data-m="name" value="${escapeHtml(item.name)}" placeholder="項目名稱">
      <input type="number" step="0.1" data-m="amount" value="${item.amount}" style="text-align:right">
      <input type="number" step="1" min="0" max="12" data-m="months" value="${item.months}" style="text-align:right">
      <div class="row-total">${fmt(subtotal)} 萬/年</div>
      <button class="btn btn-mini btn-danger" data-del-monthly="${item.id}">✕</button>
    </div>
  `;
}

function renderAnnualRow(item) {
  return `
    <div class="expense-row" data-annual-id="${item.id}" style="grid-template-columns:1.5fr 1fr 1fr auto auto;">
      <input type="text" data-a="name" value="${escapeHtml(item.name)}" placeholder="項目名稱">
      <input type="number" step="0.1" data-a="amount" value="${item.amount}" style="text-align:right">
      <div></div>
      <div></div>
      <button class="btn btn-mini btn-danger" data-del-annual="${item.id}">✕</button>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function bindEditor(y) {
  // year-level fields
  document.querySelectorAll("[data-y]").forEach((el) => {
    el.addEventListener("input", () => scheduleYearSave(y.id));
  });
  document.querySelectorAll("[data-y-pct]").forEach((el) => {
    el.addEventListener("input", () => scheduleYearSave(y.id));
  });

  // monthly items
  document.querySelectorAll("[data-monthly-id]").forEach((row) => {
    const id = +row.dataset.monthlyId;
    row.querySelectorAll("[data-m]").forEach((el) =>
      el.addEventListener("input", () => scheduleMonthlySave(id, row)));
  });
  document.querySelectorAll("[data-del-monthly]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api(`/api/monthly_expenses/${btn.dataset.delMonthly}`,
                { method: "DELETE" });
      await loadPlan(state.currentPlan.id);
    });
  });

  // annual items
  document.querySelectorAll("[data-annual-id]").forEach((row) => {
    const id = +row.dataset.annualId;
    row.querySelectorAll("[data-a]").forEach((el) =>
      el.addEventListener("input", () => scheduleAnnualSave(id, row)));
  });
  document.querySelectorAll("[data-del-annual]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api(`/api/annual_expenses/${btn.dataset.delAnnual}`,
                { method: "DELETE" });
      await loadPlan(state.currentPlan.id);
    });
  });

  // add buttons
  document.querySelectorAll("[data-add]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const kind = btn.dataset.add;
      if (kind === "monthly") {
        await api(`/api/years/${y.id}/monthly_expenses`, {
          method: "POST",
          body: { name: "新項目", amount: 0, months: 12 },
        });
      } else {
        await api(`/api/years/${y.id}/annual_expenses`, {
          method: "POST",
          body: { name: "新項目", amount: 0 },
        });
      }
      await loadPlan(state.currentPlan.id);
    });
  });
}

function scheduleYearSave(yearId) {
  debouncedSave(async () => {
    const body = {};
    document.querySelectorAll("[data-y]").forEach((el) => {
      const k = el.dataset.y;
      body[k] = el.type === "number" ? Number(el.value || 0) : el.value;
    });
    document.querySelectorAll("[data-y-pct]").forEach((el) => {
      body[el.dataset.yPct] = Number(el.value || 0) / 100;
    });
    await api(`/api/years/${yearId}`, { method: "PUT", body });
    await loadPlan(state.currentPlan.id);
  });
}

function scheduleMonthlySave(itemId, row) {
  debouncedSave(async () => {
    const body = {};
    row.querySelectorAll("[data-m]").forEach((el) => {
      body[el.dataset.m] = el.type === "number" ? Number(el.value || 0) : el.value;
    });
    await api(`/api/monthly_expenses/${itemId}`, { method: "PUT", body });
    await loadPlan(state.currentPlan.id);
  });
}

function scheduleAnnualSave(itemId, row) {
  debouncedSave(async () => {
    const body = {};
    row.querySelectorAll("[data-a]").forEach((el) => {
      body[el.dataset.a] = el.type === "number" ? Number(el.value || 0) : el.value;
    });
    await api(`/api/annual_expenses/${itemId}`, { method: "PUT", body });
    await loadPlan(state.currentPlan.id);
  });
}

// --------------------------- Top bar handlers ---------------------------

document.getElementById("plan-select").addEventListener("change", async (e) => {
  state.currentYearId = null;
  await loadPlan(+e.target.value);
});

document.getElementById("btn-new-plan").addEventListener("click", async () => {
  const name = prompt("新計畫名稱：", `計畫 ${state.plans.length + 1}`);
  if (!name) return;
  const plan = await api("/api/plans", {
    method: "POST",
    body: { name, target_amount: 4000 },
  });
  state.currentPlan = plan;
  state.currentYearId = null;
  await loadPlans();
});

document.getElementById("btn-dup-plan").addEventListener("click", async () => {
  if (!state.currentPlan) return;
  const plan = await api(`/api/plans/${state.currentPlan.id}/duplicate`,
                         { method: "POST" });
  state.currentPlan = plan;
  state.currentYearId = null;
  await loadPlans();
});

document.getElementById("btn-rename-plan").addEventListener("click", async () => {
  if (!state.currentPlan) return;
  const name = prompt("新名稱：", state.currentPlan.name);
  if (!name) return;
  await api(`/api/plans/${state.currentPlan.id}`, {
    method: "PUT",
    body: { name },
  });
  await loadPlans();
});

document.getElementById("btn-delete-plan").addEventListener("click", async () => {
  if (!state.currentPlan) return;
  if (!confirm(`確定刪除「${state.currentPlan.name}」？此動作無法復原。`)) return;
  await api(`/api/plans/${state.currentPlan.id}`, { method: "DELETE" });
  state.currentPlan = null;
  state.currentYearId = null;
  await loadPlans();
});

document.getElementById("plan-target").addEventListener("change", async (e) => {
  if (!state.currentPlan) return;
  await api(`/api/plans/${state.currentPlan.id}`, {
    method: "PUT",
    body: { target_amount: Number(e.target.value || 0) },
  });
  state.currentPlan.target_amount = Number(e.target.value || 0);
});

document.getElementById("btn-add-year").addEventListener("click", async () => {
  if (!state.currentPlan) {
    alert("請先選擇或建立計畫");
    return;
  }
  await api(`/api/plans/${state.currentPlan.id}/years`,
            { method: "POST", body: {} });
  await loadPlan(state.currentPlan.id);
  if (state.currentPlan.years.length > 0) {
    state.currentYearId =
      state.currentPlan.years[state.currentPlan.years.length - 1].id;
    renderYearList();
    renderEditor();
  }
});

// --------------------------- Simulate modal ---------------------------

document.getElementById("btn-simulate").addEventListener("click", async () => {
  if (!state.currentPlan) return;
  const target = Number(document.getElementById("plan-target").value || 4000);
  const data = await api(
    `/api/plans/${state.currentPlan.id}/simulate?target=${target}`
  );

  document.getElementById("sim-title").textContent =
    `📈 模擬到目標 — ${data.plan_name}`;

  const summary = document.getElementById("sim-summary");
  summary.innerHTML = `
    <div class="card"><div class="label">目標</div>
      <div class="value">${fmt(data.target)} 萬</div></div>
    <div class="card"><div class="label">達成年</div>
      <div class="value">${data.reached_year ?? "未達成"}</div></div>
    <div class="card"><div class="label">最終淨資產</div>
      <div class="value">${fmt(data.final_net_worth)} 萬</div></div>
    <div class="card"><div class="label">達成率</div>
      <div class="value ${data.achievement_rate >= 1 ? "positive" : ""}">
      ${fmtPct(data.achievement_rate)}</div></div>
  `;

  const tbody = document.querySelector("#sim-table tbody");
  tbody.innerHTML = data.rows.map((r) => `
    <tr class="${r.source === 'projected' ? 'projected' : ''}
        ${data.reached_year === r.year ? 'highlight' : ''}">
      <td>${r.year}</td>
      <td>${r.source === "projected" ? "推算" : "輸入"}</td>
      <td>${fmt(r.annual_income)}</td>
      <td>${fmt(r.total_expenses)}</td>
      <td>${fmt(r.annual_return)}</td>
      <td>${fmt(r.net_cash_flow)}</td>
      <td>${fmt(r.end_investment)}</td>
      <td><strong>${fmt(r.end_net_worth)}</strong></td>
    </tr>
  `).join("");

  document.getElementById("modal-simulate").classList.remove("hidden");
});

// --------------------------- Compare modal ---------------------------

document.getElementById("btn-compare").addEventListener("click", () => {
  const checklist = document.getElementById("compare-checklist");
  checklist.innerHTML = state.plans.map((p) => `
    <label><input type="checkbox" value="${p.id}" checked> ${escapeHtml(p.name)}</label>
  `).join("");
  document.getElementById("compare-target").value =
    state.currentPlan?.target_amount ?? 4000;
  document.querySelector("#compare-summary-table tbody")?.remove();
  document.getElementById("compare-detail-table").innerHTML = "";
  document.getElementById("modal-compare").classList.remove("hidden");
});

document.getElementById("btn-run-compare").addEventListener("click", async () => {
  const ids = [...document.querySelectorAll("#compare-checklist input:checked")]
    .map((el) => el.value).join(",");
  if (!ids) return alert("請至少勾選一個計畫");
  const target = Number(document.getElementById("compare-target").value || 4000);
  const data = await api(`/api/plans/compare?ids=${ids}&target=${target}`);

  // summary table
  const sumTable = document.getElementById("compare-summary-table");
  sumTable.querySelector("tbody")?.remove();
  const tbody = document.createElement("tbody");
  for (const p of data) {
    const startYear = p.rows[0]?.year ?? null;
    const yearsToReach = p.reached_year && startYear
      ? p.reached_year - startYear + 1 : null;
    const pct = Math.min(p.achievement_rate * 100, 200);
    tbody.innerHTML += `
      <tr>
        <td><strong>${escapeHtml(p.plan_name)}</strong></td>
        <td>${fmt(p.target)}</td>
        <td>${p.reached_year ?? "未達成"}</td>
        <td>${yearsToReach ?? "—"}</td>
        <td>${fmt(p.final_net_worth)}</td>
        <td>${fmtPct(p.achievement_rate)}</td>
        <td><div class="progress-bar">
          <span style="width:${Math.min(pct, 100)}%"></span></div></td>
      </tr>`;
  }
  sumTable.appendChild(tbody);

  // detail table — net worth per year per plan
  const allYears = new Set();
  data.forEach((p) => p.rows.forEach((r) => allYears.add(r.year)));
  const sortedYears = [...allYears].sort();

  const detail = document.getElementById("compare-detail-table");
  detail.innerHTML = `
    <thead><tr>
      <th>年度</th>
      ${data.map((p) => `<th>${escapeHtml(p.plan_name)} (淨資產 萬)</th>`).join("")}
    </tr></thead>
    <tbody>
      ${sortedYears.map((yr) => `
        <tr>
          <td>${yr}</td>
          ${data.map((p) => {
            const row = p.rows.find((r) => r.year === yr);
            const reached = row && row.end_net_worth >= p.target;
            return `<td class="${reached ? 'highlight' : ''}">${row ? fmt(row.end_net_worth) : "—"}</td>`;
          }).join("")}
        </tr>`).join("")}
    </tbody>
  `;
});

// --------------------------- Modal close ---------------------------

document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelector(btn.dataset.close).classList.add("hidden");
  });
});

document.querySelectorAll(".modal").forEach((m) => {
  m.addEventListener("click", (e) => {
    if (e.target === m) m.classList.add("hidden");
  });
});

// --------------------------- Init ---------------------------

loadPlans();
