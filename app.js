(function () {
  "use strict";

  // ==================== 配置常量 ====================
  // localStorage 存储键名，用于持久化账目数据
  const STORAGE_KEY = "vibe-wallet-records";
  
  // 支出分类列表，用于饼状图分类统计
  const EXPENSE_CATEGORIES = ["餐饮", "娱乐", "购物"];

  // 饼状图各分类的颜色配置（半透明填充色）
  const CATEGORY_COLORS = {
    餐饮: "rgba(236, 72, 153, 0.85)",
    娱乐: "rgba(168, 85, 247, 0.85)",
    购物: "rgba(34, 211, 238, 0.85)",
  };

  // 饼状图各分类的边框颜色（实色）
  const CATEGORY_BORDERS = {
    餐饮: "#ec4899",
    娱乐: "#a855f7",
    购物: "#22d3ee",
  };

  // ==================== 全局状态 ====================
  // 账目记录数组，每条记录包含：id, amount, category, type, date
  /** @type {Array<{id: string, amount: number, category: string, type: 'expense'|'income', date: string}>} */
  let records = [];

  // Chart.js 图表实例
  let chart = null;
  let lineChart = null;

  // ==================== DOM 元素引用 ====================
  // 表单相关元素
  const form = document.getElementById("recordForm");
  const amountInput = document.getElementById("amount");
  const categorySelect = document.getElementById("category");
  const typeSelect = document.getElementById("type");

  // 汇总显示元素
  const totalExpenseEl = document.getElementById("totalExpense");
  const totalIncomeEl = document.getElementById("totalIncome");
  const totalBalanceEl = document.getElementById("totalBalance");

  // 饼状图相关元素
  const chartEmptyEl = document.getElementById("chartEmpty");
  const canvas = document.getElementById("expenseChart");

  // 折线图相关元素
  const lineChartEmptyEl = document.getElementById("lineChartEmpty");
  const lineCanvas = document.getElementById("lineChart");

  // 历史列表相关元素
  const historyListEl = document.getElementById("history-list");
  const historyEmptyEl = document.getElementById("historyEmpty");

  // ==================== 数据持久化层 ====================
  /**
   * 从 localStorage 加载账目数据
   * 容错处理：如果数据损坏或格式错误，则重置为空数组
   */
  function loadRecords() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      records = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(records)) records = [];
    } catch (error) {
      console.error("加载账目数据失败:", error);
      records = [];
    }
  }

  /**
   * 将账目数据保存到 localStorage
   * 在每次数据变更后调用，确保数据持久化
   */
  function saveRecords() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch (error) {
      console.error("保存账目数据失败:", error);
    }
  }

  // ==================== 工具函数 ====================
  /**
   * 格式化金额显示
   * @param {number} value - 数值
   * @returns {string} 格式化后的金额字符串，如 "¥123.45"
   */
  function formatCurrency(value) {
    if (typeof value !== "number" || isNaN(value)) {
      return "¥0.00";
    }
    return "¥" + value.toFixed(2);
  }

  /**
   * 格式化日期时间为完整显示格式
   * 用于历史列表显示
   * @param {string} isoString - ISO 8601 格式的时间字符串
   * @returns {string} 格式化后的日期时间，如 "2024-01-15 14:30"
   */
  function formatDate(isoString) {
    if (!isoString) return "";
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "";
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return year + "-" + month + "-" + day + " " + hours + ":" + minutes;
  }

  /**
   * 提取日期键（YYYY-MM-DD）
   * 用于按日期分组统计
   * @param {string} isoString - ISO 8601 格式的时间字符串
   * @returns {string} 日期键，如 "2024-01-15"
   */
  function getDateKey(isoString) {
    if (!isoString) return "";
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "";
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  // ==================== 数据计算层 ====================
  /**
   * 按分类计算支出总额
   * 遍历所有记录，统计每个支出分类的总金额
   * @returns {Object} 分类到金额的映射，如 { 餐饮: 100, 娱乐: 50, 购物: 0 }
   */
  function getExpenseByCategory() {
    const totals = {};
    EXPENSE_CATEGORIES.forEach(function (cat) {
      totals[cat] = 0;
    });

    records.forEach(function (record) {
      if (record.type === "expense" && totals.hasOwnProperty(record.category)) {
        totals[record.category] += record.amount;
      }
    });

    return totals;
  }

  /**
   * 计算总收入和总支出
   * 遍历所有记录，按类型累加金额
   * @returns {Object} 包含 expense 和 income 属性的对象
   */
  function getTotals() {
    let expense = 0;
    let income = 0;

    records.forEach(function (record) {
      if (record.type === "expense") {
        expense += record.amount;
      } else if (record.type === "income") {
        income += record.amount;
      }
    });

    return { expense: expense, income: income };
  }

  /**
   * 按日期分组计算每日收入和支出
   * 用于折线图数据准备
   * @returns {Object} 包含 labels, incomeData, expenseData 的对象
   */
  function getDailyTotals() {
    const dailyData = {};

    // 按日期分组累加
    records.forEach(function (record) {
      const dateKey = getDateKey(record.date);
      if (!dateKey) return;
      
      if (!dailyData[dateKey]) {
        dailyData[dateKey] = { income: 0, expense: 0 };
      }
      
      if (record.type === "income") {
        dailyData[dateKey].income += record.amount;
      } else if (record.type === "expense") {
        dailyData[dateKey].expense += record.amount;
      }
    });

    // 按日期排序
    const sortedDates = Object.keys(dailyData).sort(function (a, b) {
      return new Date(a) - new Date(b);
    });

    // 构建图表数据数组
    const labels = sortedDates;
    const incomeData = sortedDates.map(function (date) {
      return dailyData[date].income;
    });
    const expenseData = sortedDates.map(function (date) {
      return dailyData[date].expense;
    });

    return { labels: labels, incomeData: incomeData, expenseData: expenseData };
  }

  // ==================== DOM 更新层 ====================
  /**
   * 更新汇总显示（总支出、总收入、当前结余）
   * 计算结余并根据正负值切换颜色样式
   */
  function updateSummary() {
    const totals = getTotals();
    const balance = totals.income - totals.expense;

    totalExpenseEl.textContent = formatCurrency(totals.expense);
    totalIncomeEl.textContent = formatCurrency(totals.income);
    totalBalanceEl.textContent = formatCurrency(balance);

    // 根据结余正负切换颜色类
    totalBalanceEl.classList.remove("summary__value--income", "summary__value--expense");
    if (balance >= 0) {
      totalBalanceEl.classList.add("summary__value--income");
    } else {
      totalBalanceEl.classList.add("summary__value--expense");
    }
  }

  /**
   * 渲染历史账目明细列表
   * 按时间倒序排列，每条记录显示日期、分类、类型、金额和删除按钮
   */
  function renderHistoryList() {
    historyListEl.innerHTML = "";
    const hasRecords = records.length > 0;
    historyEmptyEl.classList.toggle("hidden", hasRecords);

    if (!hasRecords) return;

    // 按时间倒序排序
    const sortedRecords = records.slice().sort(function (a, b) {
      return new Date(b.date) - new Date(a.date);
    });

    // 生成列表项
    sortedRecords.forEach(function (record) {
      const item = document.createElement("div");
      item.className = "history-item";
      item.dataset.id = record.id;

      // 根据类型设置金额颜色
      const amountColor = record.type === "expense" ? "var(--neon-pink)" : "var(--neon-cyan)";
      const amountTextShadow = record.type === "expense" 
        ? "0 0 10px rgba(236, 72, 153, 0.5)" 
        : "0 0 10px rgba(34, 211, 238, 0.5)";

      item.innerHTML =
        '<div class="history-item__info">' +
        '<div class="history-item__date">' + formatDate(record.date) + "</div>" +
        '<div class="history-item__details">' +
        '<span class="history-item__category">' + record.category + "</span>" +
        '<span class="history-item__type">' + (record.type === "expense" ? "支出" : "收入") + "</span>" +
        "</div>" +
        "</div>" +
        '<div class="history-item__amount" style="color: ' + amountColor + "; text-shadow: " + amountTextShadow + '">' +
        formatCurrency(record.amount) +
        "</div>" +
        '<button class="history-item__delete" data-id="' + record.id + '">删除</button>';

      historyListEl.appendChild(item);
    });

    // 绑定删除按钮事件
    document.querySelectorAll(".history-item__delete").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (id) deleteRecord(id);
      });
    });
  }

  // ==================== 图表数据构建层 ====================
  /**
   * 构建饼状图数据
   * 从分类统计数据中提取 Chart.js 需要的格式
   * @returns {Object} 包含 labels, data, backgroundColor, borderColor 的对象
   */
  function buildChartData() {
    const byCategory = getExpenseByCategory();
    const labels = [];
    const data = [];
    const backgroundColor = [];
    const borderColor = [];

    EXPENSE_CATEGORIES.forEach(function (cat) {
      if (byCategory[cat] > 0) {
        labels.push(cat);
        data.push(byCategory[cat]);
        backgroundColor.push(CATEGORY_COLORS[cat]);
        borderColor.push(CATEGORY_BORDERS[cat]);
      }
    });

    return { labels: labels, data: data, backgroundColor: backgroundColor, borderColor: borderColor };
  }

  /**
   * 构建折线图数据
   * 直接返回每日统计数据
   * @returns {Object} 包含 labels, incomeData, expenseData 的对象
   */
  function buildLineChartData() {
    return getDailyTotals();
  }

  // ==================== 图表初始化与更新层 ====================
  /**
   * 初始化饼状图
   * 使用 Chart.js 创建支出分类占比饼状图
   * 配置霓虹暗黑主题的样式
   */
  function initChart() {
    const chartData = buildChartData();
    const hasData = chartData.data.length > 0;

    chartEmptyEl.classList.toggle("hidden", hasData);

    chart = new Chart(canvas, {
      type: "pie",
      data: {
        labels: chartData.labels,
        datasets: [
          {
            data: chartData.data,
            backgroundColor: chartData.backgroundColor,
            borderColor: chartData.borderColor,
            borderWidth: 2,
            hoverOffset: 12,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              color: "#8b8b9e",
              padding: 16,
              font: { size: 13, family: "'Segoe UI', 'PingFang SC', sans-serif" },
              usePointStyle: true,
              pointStyle: "circle",
            },
          },
          tooltip: {
            backgroundColor: "rgba(25, 25, 35, 0.95)",
            titleColor: "#f0f0f5",
            bodyColor: "#22d3ee",
            borderColor: "rgba(168, 85, 247, 0.4)",
            borderWidth: 1,
            padding: 12,
            callbacks: {
              label: function (context) {
                const total = context.dataset.data.reduce(function (a, b) {
                  return a + b;
                }, 0);
                const value = context.raw;
                const pct = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                return " " + context.label + ": " + formatCurrency(value) + " (" + pct + "%)";
              },
            },
          },
        },
      },
    });
  }

  /**
   * 更新饼状图数据
   * 在数据变更后调用，重新计算并更新图表
   */
  function updateChart() {
    if (!chart) return;
    
    const chartData = buildChartData();
    const hasData = chartData.data.length > 0;

    chartEmptyEl.classList.toggle("hidden", hasData);

    chart.data.labels = chartData.labels;
    chart.data.datasets[0].data = chartData.data;
    chart.data.datasets[0].backgroundColor = chartData.backgroundColor;
    chart.data.datasets[0].borderColor = chartData.borderColor;
    chart.update();
  }

  /**
   * 初始化折线图
   * 使用 Chart.js 创建月度消费趋势折线图
   * 配置双数据线（收入/支出）和霓虹暗黑主题样式
   */
  function initLineChart() {
    const lineChartData = buildLineChartData();
    const hasData = lineChartData.labels.length > 0;

    lineChartEmptyEl.classList.toggle("hidden", hasData);

    lineChart = new Chart(lineCanvas, {
      type: "line",
      data: {
        labels: lineChartData.labels,
        datasets: [
          {
            label: "收入",
            data: lineChartData.incomeData,
            borderColor: "#22d3ee",
            backgroundColor: "rgba(34, 211, 238, 0.1)",
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: "#22d3ee",
            pointBorderColor: "#fff",
            pointBorderWidth: 2,
          },
          {
            label: "支出",
            data: lineChartData.expenseData,
            borderColor: "#ec4899",
            backgroundColor: "rgba(236, 72, 153, 0.1)",
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: "#ec4899",
            pointBorderColor: "#fff",
            pointBorderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              color: "#8b8b9e",
              padding: 16,
              font: { size: 13, family: "'Segoe UI', 'PingFang SC', sans-serif" },
              usePointStyle: true,
              pointStyle: "circle",
            },
          },
          tooltip: {
            backgroundColor: "rgba(25, 25, 35, 0.95)",
            titleColor: "#f0f0f5",
            bodyColor: "#22d3ee",
            borderColor: "rgba(168, 85, 247, 0.4)",
            borderWidth: 1,
            padding: 12,
            callbacks: {
              label: function (context) {
                return " " + context.dataset.label + ": " + formatCurrency(context.raw);
              },
            },
          },
        },
        scales: {
          x: {
            grid: {
              color: "rgba(168, 85, 247, 0.1)",
            },
            ticks: {
              color: "#8b8b9e",
              font: { size: 11 },
            },
          },
          y: {
            grid: {
              color: "rgba(168, 85, 247, 0.1)",
            },
            ticks: {
              color: "#8b8b9e",
              font: { size: 11 },
              callback: function (value) {
                return "¥" + value;
              },
            },
          },
        },
      },
    });
  }

  /**
   * 更新折线图数据
   * 在数据变更后调用，重新计算并更新图表
   */
  function updateLineChart() {
    if (!lineChart) return;
    
    const lineChartData = buildLineChartData();
    const hasData = lineChartData.labels.length > 0;

    lineChartEmptyEl.classList.toggle("hidden", hasData);

    lineChart.data.labels = lineChartData.labels;
    lineChart.data.datasets[0].data = lineChartData.incomeData;
    lineChart.data.datasets[1].data = lineChartData.expenseData;
    lineChart.update();
  }

  // ==================== 业务逻辑层 ====================
  /**
   * 同步分类选择与类型选择
   * 当选择"收入"类型时，自动禁用分类选择并设为"收入"
   * 当选择"支出"类型时，启用分类选择并重置为默认值
   */
  function syncCategoryWithType() {
    const type = typeSelect.value;
    if (type === "income") {
      categorySelect.value = "收入";
      categorySelect.disabled = true;
    } else {
      categorySelect.disabled = false;
      if (categorySelect.value === "收入") {
        categorySelect.value = "餐饮";
      }
    }
  }

  /**
   * 删除账目记录
   * 根据记录 ID 删除对应记录，并更新所有相关视图
   * @param {string} id - 要删除的记录 ID
   */
  function deleteRecord(id) {
    if (!id) return;
    
    records = records.filter(function (record) {
      return record.id !== id;
    });
    
    saveRecords();
    updateSummary();
    updateChart();
    updateLineChart();
    renderHistoryList();
  }

  /**
   * 处理表单提交
   * 验证输入，创建新记录，保存数据，更新所有视图
   */
  function handleFormSubmit(e) {
    e.preventDefault();

    const amount = parseFloat(amountInput.value);
    if (!amount || amount <= 0 || isNaN(amount)) {
      amountInput.focus();
      return;
    }

    const type = typeSelect.value;
    let category = categorySelect.value;

    if (type === "income") {
      category = "收入";
    }

    const record = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      amount: amount,
      category: category,
      type: type,
      date: new Date().toISOString(),
    };

    records.push(record);
    saveRecords();
    updateSummary();
    updateChart();
    updateLineChart();
    renderHistoryList();

    amountInput.value = "";
    amountInput.focus();
  }

  // ==================== 事件绑定 ====================
  form.addEventListener("submit", handleFormSubmit);
  typeSelect.addEventListener("change", syncCategoryWithType);

  // ==================== 应用初始化 ====================
  // 按顺序执行初始化流程
  loadRecords();
  syncCategoryWithType();
  initChart();
  initLineChart();
  updateSummary();
  renderHistoryList();
})();
