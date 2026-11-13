# Workspace surface brief

## Scope

- Mode: Operate.
- Audience: 正在创建、加入和共同决定线下集合地点的校园同学或朋友。
- Job: 快速理解当前活动状态，比较真实路线，填写需求并完成投票。
- Primary action: 根据活动状态完成下一步。
- Constraints: 保留现有活动、地图、投票、身份、隐私、反馈接口和 `data-action` 事件；原生 HTML、CSS、JavaScript 架构不变。

## Direction contract

**THESIS** — “在一张温暖的玻璃工作台上把每个人的路放到一起”。界面拒绝传统侧边栏后台和密集等宽小卡片，用少量大小有别的玻璃区域承载主任务。

**OWN-WORLD** — 米白到浅杏的底层渐变、低饱和橙粉光晕、半透明暖白玻璃、深炭色胶囊导航和操作托盘。外层圆角 32px，主要区域 24px，控件 14–18px；橙粉渐变只标记当前状态和主要行动。

**STORY** — 用户进入后先看到当前活动与下一步，再查看成员准备度和其他活动；进入推荐页后，地图成为视觉中心，候选地点在旁比较，投票与管理操作稳定地集中在下方深色区域。

**FIRST VIEWPORT** — 桌面端悬浮工作台距窗口四周留白；左侧品牌、中部深炭色胶囊导航、右侧身份入口。内容区使用两至四块不等宽玻璃区域；手机端变为单列，核心操作和地图优先。

**FORM** — Code-led，`seed: none (pinned)`；用户明确选择“A 暖色玻璃岛”，并指定“圆角 + 毛玻璃 + 渐变橙粉色”，参考所给工作台的大块圆角分区与顶部胶囊导航。

**FINISH** — unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
