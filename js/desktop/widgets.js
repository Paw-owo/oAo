/* ============================================================
   widgets.js — 桌面小组件
   4 个：时间 / 天气 / 今日提示 / 黑胶唱片
   挂在 window.Phone.Widgets
   ============================================================ */
(function (global) {
  "use strict";

  const TIPS = [
    "今天也要好好吃饭哦",
    "记得喝水，你是最棒的",
    "累了就抱抱小棉花",
    "天气冷了，多穿一件",
    "笑一个嘛，看镜头～",
    "今天有什么想分享的吗？",
    "我在这里陪你哦",
    "记得早点睡觉呀",
    "想吃甜的就吃吧，今天辛苦了",
    "抱抱你，没事的",
    "今天也要好好生活呀",
    "想我的时候就来找我",
    "不开心可以跟我说哦",
    "你笑起来真好看",
    "再坚持一下下就好啦",
  ];

  const WEATHER_TIPS = [
    { icon: "sun", desc: "晴朗", temp: 24 },
    { icon: "cloud", desc: "多云", temp: 21 },
    { icon: "rain", desc: "小雨", temp: 18 },
    { icon: "snow", desc: "小雪", temp: -2 },
  ];

  /**
   * 我（小组件）渲染到容器
   * @param {HTMLElement} container
   */
  function mount(container) {
    const U = global.Phone.Utils;
    const wrap = U.el("div", { class: "widget-area" });

    // 时间组件
    const wTime = U.el("div", { class: "widget widget-time" });
    const timeMain = U.el("div", { class: "wt-main" });
    const timeDate = U.el("div", { class: "wt-date" });
    wTime.appendChild(timeMain);
    wTime.appendChild(timeDate);
    wTime.appendChild(U.el("div", {
      class: "wt-deco",
      html: global.Phone.IconLibrary.get("clock", { size: 36, strokeWidth: 1.2 })
    }));

    // 天气组件
    const wWeather = U.el("div", { class: "widget widget-weather" });
    const weather = U.pick(WEATHER_TIPS);
    wWeather.appendChild(U.el("div", { class: "ww-top" }, [
      U.el("div", { class: "ww-icon", html: global.Phone.IconLibrary.get(weather.icon, { size: 28 }) }),
      U.el("div", { class: "ww-temp", text: weather.temp + "°" }),
    ]));
    wWeather.appendChild(U.el("div", {}, [
      U.el("div", { class: "ww-desc", text: weather.desc + " · 体感舒适" }),
      U.el("div", { class: "ww-city", text: "棉花糖小镇" }),
    ]));

    // 今日提示
    const wTip = U.el("div", { class: "widget widget-tip" });
    const tipText = U.pick(TIPS);
    wTip.appendChild(U.el("div", { class: "wtip-icon", html: global.Phone.IconLibrary.get("sb-smile", { size: 20 }) }));
    wTip.appendChild(U.el("div", { class: "wtip-text", text: tipText }));

    // 黑胶唱片
    const wVinyl = U.el("div", { class: "widget widget-vinyl" });
    const disc = U.el("div", { class: "vinyl-disc" });
    let spinning = false;
    disc.addEventListener("click", () => {
      spinning = !spinning;
      disc.classList.toggle("spinning", spinning);
      if (spinning) {
        // 触发事件：用户在桌面点了唱片
        global.Phone.EventCenter.emit("widget_vinyl_clicked", {
          sourceApp: "desktop",
          summary: "用户点了桌面黑胶唱片",
          data: { spinning: true }
        });
      }
    });
    wVinyl.appendChild(disc);

    wrap.appendChild(wTime);
    wrap.appendChild(wWeather);
    wrap.appendChild(wTip);
    wrap.appendChild(wVinyl);
    container.appendChild(wrap);

    // 时间更新
    function tick() {
      const now = new Date();
      timeMain.textContent = U.pad2(now.getHours()) + ":" + U.pad2(now.getMinutes());
      timeDate.textContent = (now.getMonth() + 1) + "月" + now.getDate() + "日 " + U.WEEK_CN[now.getDay()];
    }
    tick();
    const timer = setInterval(tick, 30000);

    // 提示语每 5 分钟换一次
    const tipTimer = setInterval(() => {
      const newTip = U.pick(TIPS);
      const tipEl = wTip.querySelector(".wtip-text");
      if (tipEl) {
        tipEl.style.opacity = "0";
        setTimeout(() => { tipEl.textContent = newTip; tipEl.style.opacity = "1"; }, 200);
      }
    }, 5 * 60 * 1000);

    return {
      el: wrap,
      destroy: () => {
        clearInterval(timer);
        clearInterval(tipTimer);
      }
    };
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.Widgets = { mount, TIPS, WEATHER_TIPS };
})(window);
