(function () {
  "use strict";

  var STORAGE_KEY = "health-workbench-data";
  var ROUTES = ["dashboard", "record", "library"];
  var PRESETS = [
    { id: "体重", unit: "kg", placeholder: "例如：65.5" },
    { id: "血压", unit: "mmHg", placeholder: "例如：120/80" },
    { id: "血糖", unit: "mmol/L", placeholder: "例如：5.6" },
    { id: "心率", unit: "次/分", placeholder: "例如：72" },
    { id: "睡眠", unit: "小时", placeholder: "例如：7.5" },
    { id: "运动", unit: "分钟", placeholder: "例如：30" },
    { id: "饮水", unit: "ml", placeholder: "例如：500" },
    { id: "用药", unit: "", placeholder: "剂量或次数，可选" },
    { id: "症状", unit: "", placeholder: "程度或其他描述，可选" },
    { id: "自定义", unit: "", placeholder: "填写数值", custom: true }
  ];

  var state = loadState();
  var toastTimer = 0;

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function uid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function emptyState() {
    return { version: 1, records: [], library: [] };
  }

  function normalizeState(raw) {
    var data = emptyState();
    if (!raw || typeof raw !== "object") return data;
    if (Array.isArray(raw.records)) {
      data.records = raw.records
        .filter(function (item) { return item && typeof item === "object"; })
        .map(function (item) {
          return {
            id: String(item.id || uid()),
            type: String(item.type || "记录").trim() || "记录",
            value: item.value == null ? "" : String(item.value).trim(),
            unit: item.unit == null ? "" : String(item.unit).trim(),
            time: String(item.time || ""),
            note: item.note == null ? "" : String(item.note).trim(),
            createdAt: String(item.createdAt || item.time || new Date().toISOString())
          };
        });
    }
    if (Array.isArray(raw.library)) {
      data.library = raw.library
        .filter(function (item) { return item && typeof item === "object"; })
        .map(function (item) {
          return {
            id: String(item.id || uid()),
            title: String(item.title || "").trim(),
            url: String(item.url || "").trim(),
            note: item.note == null ? "" : String(item.note).trim(),
            createdAt: String(item.createdAt || new Date().toISOString())
          };
        })
        .filter(function (item) { return item.title && item.url; });
    }
    return data;
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyState();
      return normalizeState(JSON.parse(raw));
    } catch (err) {
      return emptyState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      records: state.records,
      library: state.library
    }));
  }

  function showToast(message) {
    var el = $("toast");
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.hidden = true;
    }, 2400);
  }

  function currentRoute() {
    var hash = (location.hash || "#dashboard").replace(/^#/, "").split("?")[0];
    return ROUTES.indexOf(hash) >= 0 ? hash : "dashboard";
  }

  function renderRoute() {
    var route = currentRoute();
    if (location.hash !== "#" + route) {
      history.replaceState(null, "", "#" + route);
    }
    ROUTES.forEach(function (name) {
      var view = $("view-" + name);
      var on = name === route;
      view.hidden = !on;
    });
    document.querySelectorAll("a[data-route]").forEach(function (link) {
      var on = link.getAttribute("data-route") === route;
      if (on) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    if (route === "dashboard") renderDashboard();
    if (route === "record") prepareRecordForm(false);
    if (route === "library") renderLibrary();
  }

  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function toDateTimeLocal(date) {
    return (
      date.getFullYear() +
      "-" + pad(date.getMonth() + 1) +
      "-" + pad(date.getDate()) +
      "T" + pad(date.getHours()) +
      ":" + pad(date.getMinutes())
    );
  }

  function parseTime(value) {
    if (!value) return null;
    var d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  function formatDateTime(value) {
    var d = parseTime(value);
    if (!d) return value || "";
    return (
      d.getFullYear() + "年" +
      (d.getMonth() + 1) + "月" +
      d.getDate() + "日 " +
      pad(d.getHours()) + ":" + pad(d.getMinutes())
    );
  }

  function formatDateLong(date) {
    var week = "日一二三四五六".charAt(date.getDay());
    return date.getFullYear() + "年" + (date.getMonth() + 1) + "月" + date.getDate() + "日 星期" + week;
  }

  function sameDay(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function sortRecords() {
    return state.records.slice().sort(function (a, b) {
      var ta = parseTime(a.time);
      var tb = parseTime(b.time);
      var va = ta ? ta.getTime() : 0;
      var vb = tb ? tb.getTime() : 0;
      return vb - va;
    });
  }

  function todayRecords() {
    var now = new Date();
    return sortRecords().filter(function (item) {
      var t = parseTime(item.time);
      return t && sameDay(t, now);
    });
  }

  function parseNumeric(value) {
    if (value == null) return null;
    var text = String(value).trim();
    if (!text) return null;
    if (/[/／]/.test(text)) {
      var parts = text.split(/[/／]/);
      var sys = parseFloat(String(parts[0]).replace(/[^\d.+-]/g, ""));
      var dia = parseFloat(String(parts[1] || "").replace(/[^\d.+-]/g, ""));
      if (isFinite(sys) && isFinite(dia)) return { kind: "bp", sys: sys, dia: dia };
      return null;
    }
    var n = parseFloat(text.replace(/[^\d.+-]/g, ""));
    return isFinite(n) ? { kind: "num", value: n } : null;
  }

  function fillTypeSelect() {
    var select = $("record-type");
    select.innerHTML = PRESETS.map(function (item) {
      return '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(item.id) + "</option>";
    }).join("");
  }

  function currentPreset() {
    var id = $("record-type").value;
    for (var i = 0; i < PRESETS.length; i++) {
      if (PRESETS[i].id === id) return PRESETS[i];
    }
    return PRESETS[0];
  }

  function applyTypeDefaults(forceUnit) {
    var preset = currentPreset();
    $("custom-type-wrap").hidden = !preset.custom;
    $("record-value").placeholder = preset.placeholder || "填写数值";
    if (forceUnit || $("record-unit").dataset.fromPreset !== "edited") {
      $("record-unit").value = preset.unit;
      $("record-unit").dataset.fromPreset = "auto";
    }
    if (preset.custom) {
      $("record-custom-type").required = true;
    } else {
      $("record-custom-type").required = false;
    }
  }

  function prepareRecordForm(resetAll) {
    if (resetAll) {
      $("record-form").reset();
      $("record-unit").dataset.fromPreset = "auto";
    }
    if (!$("record-type").value) $("record-type").value = PRESETS[0].id;
    applyTypeDefaults(resetAll);
    $("record-time").value = toDateTimeLocal(new Date());
  }

  function renderDashboard() {
    $("today-date").textContent = formatDateLong(new Date());
    renderOverview();
    renderTrendControls();
    renderTrend();
    renderRecent();
  }

  function renderOverview() {
    var items = todayRecords();
    var latestByType = {};
    items.forEach(function (item) {
      if (!latestByType[item.type]) latestByType[item.type] = item;
    });
    var types = Object.keys(latestByType);
    var html = "";
    html += '<div class="stat"><span class="stat-label">今日记录</span>';
    html += '<span class="stat-value">' + items.length + '</span>';
    html += '<span class="stat-sub">' + (items.length ? "已记录 " + types.length + " 类" : "还没有记录") + "</span></div>";

    ["体重", "血压", "血糖", "心率", "睡眠"].forEach(function (type) {
      var item = latestByType[type];
      if (!item) return;
      var display = item.value ? escapeHtml(item.value) + (item.unit ? " " + escapeHtml(item.unit) : "") : "已记录";
      html += '<div class="stat"><span class="stat-label">今日' + escapeHtml(type) + "</span>";
      html += '<span class="stat-value">' + display + "</span></div>";
    });

    if (!items.length) {
      html += '<div class="stat stat-wide"><span class="stat-label">提示</span><span class="stat-sub">去「记录」页添加一条今日数据吧。</span></div>';
    } else if (types.length) {
      html += '<div class="stat"><span class="stat-label">今日类型</span><div class="chip-row">';
      types.forEach(function (type) {
        html += '<span class="chip">' + escapeHtml(type) + "</span>";
      });
      html += "</div></div>";
    }
    $("today-overview").innerHTML = html;
  }

  function numericTypes() {
    var map = {};
    state.records.forEach(function (item) {
      if (parseNumeric(item.value)) map[item.type] = true;
    });
    return Object.keys(map).sort();
  }

  function renderTrendControls() {
    var types = numericTypes();
    var select = $("trend-type");
    var current = select.value;
    if (!types.length) {
      select.innerHTML = '<option value="">暂无数值记录</option>';
      select.disabled = true;
      return;
    }
    select.disabled = false;
    select.innerHTML = types.map(function (type) {
      return '<option value="' + escapeHtml(type) + '">' + escapeHtml(type) + "</option>";
    }).join("");
    if (types.indexOf(current) >= 0) select.value = current;
  }

  function renderTrend() {
    var type = $("trend-type").value;
    var wrap = $("trend-chart");
    var caption = $("trend-caption");
    if (!type) {
      wrap.innerHTML = '<p class="chart-empty">暂无足够的数值记录来绘制趋势。</p>';
      caption.textContent = "";
      return;
    }
    var points = sortRecords()
      .filter(function (item) { return item.type === type; })
      .map(function (item) {
        var t = parseTime(item.time);
        var n = parseNumeric(item.value);
        if (!t || !n) return null;
        return { time: t, parsed: n, raw: item };
      })
      .filter(Boolean)
      .sort(function (a, b) { return a.time - b.time; });

    var cutoff = startOfDay(new Date());
    cutoff.setDate(cutoff.getDate() - 13);
    var recent = points.filter(function (p) { return p.time >= cutoff; });
    var used = recent.length ? recent : points.slice(-14);
    if (!used.length) {
      wrap.innerHTML = '<p class="chart-empty">暂无足够的数值记录来绘制趋势。</p>';
      caption.textContent = "";
      return;
    }
    wrap.innerHTML = drawChart(used, type);
    var from = used[0].time;
    var to = used[used.length - 1].time;
    caption.textContent =
      "共 " + used.length + " 条「" + type + "」数值，时间范围：" +
      formatDateTime(from).split(" ")[0] + " – " + formatDateTime(to).split(" ")[0] +
      "。";
  }

  function chartSize() {
    var wrap = $("trend-chart");
    var width = Math.round((wrap && wrap.clientWidth) || 0);
    if (width < 160) width = 360;
    var height = width < 480 ? 200 : width < 720 ? 220 : 240;
    return { width: width, height: height };
  }

  function drawChart(points, type) {
    var size = chartSize();
    var width = size.width;
    var height = size.height;
    var fontSize = 12;
    var padL = 44;
    var padR = 14;
    var padT = 16;
    var padB = 30;
    var isBp = points.some(function (p) { return p.parsed.kind === "bp"; });
    if (isBp) padT = 26;
    var plotW = width - padL - padR;
    var plotH = height - padT - padB;

    var values = [];
    points.forEach(function (p) {
      if (p.parsed.kind === "bp") {
        values.push(p.parsed.sys, p.parsed.dia);
      } else {
        values.push(p.parsed.value);
      }
    });
    var minV = Math.min.apply(null, values);
    var maxV = Math.max.apply(null, values);
    if (minV === maxV) {
      minV = minV > 0 ? minV * 0.9 : minV - 1;
      maxV = maxV + (Math.abs(maxV) * 0.1 || 1);
    }
    var span = maxV - minV;
    minV = minV - span * 0.12;
    maxV = maxV + span * 0.12;
    if (minV > 0 && minV < span) minV = 0;
    if (minV < 0 && values.every(function (v) { return v >= 0; })) minV = 0;

    var tickSpan = maxV - minV || 1;
    var tickRaw = tickSpan / 4;
    var tickExp = Math.pow(10, Math.floor(Math.log10(tickRaw)));
    var tickN = tickRaw / tickExp;
    var tickStep = (tickN <= 1 ? 1 : tickN <= 2 ? 2 : tickN <= 5 ? 5 : 10) * tickExp;
    minV = Math.floor(minV / tickStep) * tickStep;
    maxV = Math.ceil(maxV / tickStep) * tickStep;
    if (maxV === minV) maxV = minV + tickStep;

    var times = points.map(function (p) { return p.time.getTime(); });
    var minT = Math.min.apply(null, times);
    var maxT = Math.max.apply(null, times);
    if (minT === maxT) {
      minT -= 60 * 60 * 1000;
      maxT += 60 * 60 * 1000;
    }

    function xOf(t) {
      return padL + ((t - minT) / (maxT - minT)) * plotW;
    }
    function yOf(v) {
      return padT + (1 - (v - minV) / (maxV - minV)) * plotH;
    }

    var grid = "";
    var labels = "";
    var tickDecimals = tickStep >= 1 ? 0 : tickStep >= 0.1 ? 1 : 2;
    for (var tickVal = minV; tickVal <= maxV + tickStep * 0.5; tickVal = +(tickVal + tickStep).toFixed(10)) {
      var y = yOf(tickVal);
      grid += '<line x1="' + padL + '" y1="' + y + '" x2="' + (width - padR) + '" y2="' + y + '" stroke="#d7e0db" stroke-width="1"/>';
      var label = tickVal.toFixed(tickDecimals);
      if (tickDecimals > 0) label = label.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
      if (label === "-0") label = "0";
      labels += '<text x="' + (padL - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="' + fontSize + '" fill="#5a6964">' + escapeHtml(label) + "</text>";
    }

    var xLabels = "";
    var labelCount = Math.min(points.length, 6);
    var seen = {};
    for (var j = 0; j < points.length; j++) {
      var show = points.length <= 6 || j === 0 || j === points.length - 1 || j % Math.ceil((points.length - 1) / (labelCount - 1)) === 0;
      if (!show) continue;
      var d = points[j].time;
      var key = d.getMonth() + "-" + d.getDate();
      if (seen[key] && j !== 0 && j !== points.length - 1) continue;
      seen[key] = true;
      var x = xOf(d.getTime());
      xLabels += '<text x="' + x + '" y="' + (height - 10) + '" text-anchor="middle" font-size="' + fontSize + '" fill="#5a6964">' +
        escapeHtml(d.getMonth() + 1 + "/" + d.getDate()) + "</text>";
    }

    function seriesPath(getter, color) {
      var d = "";
      var dots = "";
      points.forEach(function (p, idx) {
        var val = getter(p);
        if (val == null) return;
        var x = xOf(p.time.getTime());
        var y = yOf(val);
        d += (d ? " L " : "M ") + x + " " + y;
        dots += '<circle cx="' + x + '" cy="' + y + '" r="4" fill="#fffcf8" stroke="' + color + '" stroke-width="2"/>';
      });
      return '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>' + dots;
    }

    var paths = "";
    var legend = "";
    if (isBp) {
      paths += seriesPath(function (p) { return p.parsed.kind === "bp" ? p.parsed.sys : p.parsed.value; }, "#146656");
      paths += seriesPath(function (p) { return p.parsed.kind === "bp" ? p.parsed.dia : null; }, "#b8612a");
      legend += '<g font-size="' + fontSize + '" fill="#172824">';
      legend += '<rect x="' + (width - 170) + '" y="6" width="10" height="3" rx="1" fill="#146656"/>';
      legend += '<text x="' + (width - 156) + '" y="11">收缩压</text>';
      legend += '<rect x="' + (width - 100) + '" y="6" width="10" height="3" rx="1" fill="#b8612a"/>';
      legend += '<text x="' + (width - 86) + '" y="11">舒张压</text></g>';
    } else {
      paths += seriesPath(function (p) { return p.parsed.kind === "num" ? p.parsed.value : p.parsed.sys; }, "#146656");
    }

    return (
      '<svg viewBox="0 0 ' + width + " " + height + '" width="' + width + '" height="' + height +
      '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' + escapeHtml(type) + '趋势图">' +
      '<rect x="0" y="0" width="' + width + '" height="' + height + '" fill="#fffcf8" rx="10"/>' +
      grid + labels + xLabels + paths + legend +
      "</svg>"
    );
  }

  function renderRecent() {
    var list = $("recent-list");
    var items = sortRecords();
    if (!items.length) {
      list.innerHTML = '<p class="empty">还没有记录。</p>';
      return;
    }
    list.innerHTML = items.map(function (item) {
      var value = item.value
        ? '<span class="item-value">' + escapeHtml(item.value) + (item.unit ? " " + escapeHtml(item.unit) : "") + "</span>"
        : "";
      var note = item.note ? '<p class="item-note">' + escapeHtml(item.note) + "</p>" : "";
      return (
        '<article class="item" data-id="' + escapeHtml(item.id) + '">' +
          '<div class="item-main">' +
            '<p class="item-title"><span>' + escapeHtml(item.type) + "</span>" + value + "</p>" +
            '<p class="item-meta">' + escapeHtml(formatDateTime(item.time)) + "</p>" +
            note +
          "</div>" +
          '<div class="item-actions">' +
            '<button type="button" class="btn btn-tiny btn-danger" data-action="delete-record">删除</button>' +
          "</div>" +
        "</article>"
      );
    }).join("");
  }

  function renderLibrary() {
    var list = $("library-list");
    var items = state.library.slice().sort(function (a, b) {
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
    if (!items.length) {
      list.innerHTML = '<p class="empty">知识库还是空的，添加一条常用资讯链接吧。</p>';
      return;
    }
    list.innerHTML = items.map(function (item) {
      var tags = [];
      var note = item.note;
      if (note && note.indexOf(",") >= 0 || (note && /，/.test(note) && note.length <= 80)) {
        var parts = note.split(/[,，]/).map(function (t) { return t.trim(); }).filter(Boolean);
        if (parts.length > 1 && parts.every(function (t) { return t.length <= 16; })) {
          tags = parts;
          note = "";
        }
      }
      var tagHtml = tags.length
        ? '<div class="tag-row">' + tags.map(function (t) { return '<span class="tag">' + escapeHtml(t) + "</span>"; }).join("") + "</div>"
        : "";
      var noteHtml = note ? '<p class="item-note">' + escapeHtml(note) + "</p>" : "";
      var safeUrl = sanitizeUrl(item.url);
      return (
        '<article class="item" data-id="' + escapeHtml(item.id) + '">' +
          '<div class="item-main">' +
            '<p class="item-title">' + escapeHtml(item.title) + "</p>" +
            '<p class="item-meta">' + escapeHtml(item.url) + "</p>" +
            noteHtml + tagHtml +
          "</div>" +
          '<div class="item-actions">' +
            (safeUrl ? '<a class="btn btn-tiny btn-link" href="' + escapeHtml(safeUrl) + '" target="_blank" rel="noopener noreferrer">打开</a>' : "") +
            '<button type="button" class="btn btn-tiny btn-danger" data-action="delete-library">删除</button>' +
          "</div>" +
        "</article>"
      );
    }).join("");
  }

  function sanitizeUrl(url) {
    try {
      var u = new URL(url, location.href);
      if (u.protocol === "http:" || u.protocol === "https:") return u.href;
    } catch (err) {}
    return "";
  }

  function onSaveRecord(event) {
    event.preventDefault();
    var preset = currentPreset();
    var type = preset.custom ? $("record-custom-type").value.trim() : preset.id;
    var value = $("record-value").value.trim();
    var unit = $("record-unit").value.trim();
    var time = $("record-time").value;
    var note = $("record-note").value.trim();
    if (!type) {
      showToast("请填写要记录的内容");
      $("record-custom-type").focus();
      return;
    }
    if (!time || !parseTime(time)) {
      showToast("请填写有效的时间");
      $("record-time").focus();
      return;
    }
    if (!value && !note && type !== "用药" && type !== "症状") {
      showToast("请至少填写数值或备注");
      $("record-value").focus();
      return;
    }
    state.records.push({
      id: uid(),
      type: type,
      value: value,
      unit: unit,
      time: parseTime(time).toISOString(),
      note: note,
      createdAt: new Date().toISOString()
    });
    saveState();
    showToast("已保存记录");
    prepareRecordForm(true);
    location.hash = "#dashboard";
  }

  function onSaveLibrary(event) {
    event.preventDefault();
    var title = $("library-title").value.trim();
    var url = $("library-url").value.trim();
    var note = $("library-note").value.trim();
    if (!title) {
      showToast("请填写标题");
      $("library-title").focus();
      return;
    }
    if (!sanitizeUrl(url)) {
      showToast("请填写有效的链接（以 http:// 或 https:// 开头）");
      $("library-url").focus();
      return;
    }
    state.library.push({
      id: uid(),
      title: title,
      url: sanitizeUrl(url),
      note: note,
      createdAt: new Date().toISOString()
    });
    saveState();
    $("library-form").reset();
    showToast("已添加到知识库");
    renderLibrary();
  }

  function generateBackup() {
    var payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      app: "健康工作台",
      records: state.records,
      library: state.library
    };
    $("backup-text").value = JSON.stringify(payload, null, 2);
    showToast("已生成备份文本");
  }

  function copyBackup() {
    var text = $("backup-text").value;
    if (!text.trim()) {
      generateBackup();
      text = $("backup-text").value;
    }
    function fallback() {
      $("backup-text").focus();
      $("backup-text").select();
      try {
        if (document.execCommand("copy")) showToast("已复制");
        else showToast("请手动复制文本框中的内容");
      } catch (err) {
        showToast("请手动复制文本框中的内容");
      }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        showToast("已复制");
      }).catch(fallback);
    } else {
      fallback();
    }
  }

  function restoreBackup() {
    var text = $("backup-text").value.trim();
    if (!text) {
      showToast("请先粘贴备份文本");
      $("backup-text").focus();
      return;
    }
    var parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      showToast("备份文本无效，无法解析 JSON");
      return;
    }
    if (!parsed || typeof parsed !== "object" || (!Array.isArray(parsed.records) && !Array.isArray(parsed.library))) {
      showToast("备份文本格式不正确");
      return;
    }
    if (!confirm("恢复将替换当前保存在本机浏览器中的全部记录和知识库，确定继续？")) {
      return;
    }
    state = normalizeState(parsed);
    saveState();
    renderDashboard();
    renderLibrary();
    showToast("已从文本恢复");
  }

  function onClick(event) {
    var btn = event.target.closest("[data-action]");
    if (!btn) return;
    var action = btn.getAttribute("data-action");
    var item = btn.closest("[data-id]");
    var id = item && item.getAttribute("data-id");
    if (action === "delete-record" && id) {
      if (!confirm("确定删除这条记录？")) return;
      state.records = state.records.filter(function (r) { return r.id !== id; });
      saveState();
      renderDashboard();
      showToast("已删除记录");
    }
    if (action === "delete-library" && id) {
      if (!confirm("确定删除这条内容？")) return;
      state.library = state.library.filter(function (r) { return r.id !== id; });
      saveState();
      renderLibrary();
      showToast("已删除内容");
    }
  }

  function init() {
    fillTypeSelect();
    prepareRecordForm(true);
    $("record-type").addEventListener("change", function () {
      $("record-unit").dataset.fromPreset = "auto";
      applyTypeDefaults(true);
      if (currentPreset().custom) $("record-custom-type").focus();
    });
    $("record-unit").addEventListener("input", function () {
      $("record-unit").dataset.fromPreset = "edited";
    });
    $("record-form").addEventListener("submit", onSaveRecord);
    $("record-form").addEventListener("reset", function () {
      setTimeout(function () { prepareRecordForm(true); }, 0);
    });
    $("library-form").addEventListener("submit", onSaveLibrary);
    $("btn-backup").addEventListener("click", generateBackup);
    $("btn-copy").addEventListener("click", copyBackup);
    $("btn-restore").addEventListener("click", restoreBackup);
    $("trend-type").addEventListener("change", renderTrend);
    document.addEventListener("click", onClick);
    window.addEventListener("hashchange", renderRoute);
    var chartResizeTimer = 0;
    function onChartResize() {
      if (currentRoute() !== "dashboard") return;
      clearTimeout(chartResizeTimer);
      chartResizeTimer = setTimeout(function () {
        renderTrend();
      }, 80);
    }
    window.addEventListener("resize", onChartResize);
    if (typeof ResizeObserver !== "undefined") {
      var ro = new ResizeObserver(onChartResize);
      ro.observe($("trend-chart"));
    }
    renderRoute();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
