---
name: MeetPoint
description: 让校园伙伴轻松选出对大家都方便的集合点
colors:
  coral-action: "#F26843"
  coral-action-deep: "#D95732"
  ink-warm: "#1F191A"
  ink-muted: "#6F6865"
  paper-cream: "#FAF9F4"
  surface: "#FFFFFF"
  line-warm: "#E5DED7"
  route-green: "#566B4B"
  route-blue: "#3568D4"
  danger: "#B42318"
typography:
  display:
    fontFamily: "PingFang SC, Microsoft YaHei, Segoe UI, sans-serif"
    fontSize: "clamp(2.25rem, 5vw, 4.5rem)"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "PingFang SC, Microsoft YaHei, Segoe UI, sans-serif"
    fontSize: "clamp(1.75rem, 3vw, 2.5rem)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "PingFang SC, Microsoft YaHei, Segoe UI, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 650
    lineHeight: 1.4
  body:
    fontFamily: "PingFang SC, Microsoft YaHei, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontFamily: "PingFang SC, Microsoft YaHei, Segoe UI, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.02em"
rounded:
  sm: "10px"
  md: "12px"
  lg: "16px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
  3xl: "48px"
  4xl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.coral-action}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.coral-action-deep}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-warm}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
    height: "44px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-warm}"
    rounded: "{rounded.lg}"
    padding: "24px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-warm}"
    rounded: "{rounded.md}"
    padding: "12px 14px"
    height: "44px"
---

# Design System: MeetPoint

## Overview

**Creative North Star: "城市会面手册"**

MeetPoint 像一本为朋友共同出行而编辑的城市手册：温暖、有秩序，既能快速给出答案，也愿意解释答案从何而来。米白纸张感承接用户选择的 PPT 气质，大标题和充足留白建立“大气”，珊瑚橙只把注意力带向下一步行动。

语言保持轻松亲切，例如“大家在哪儿见？”和“看看哪个地点对大家都方便”。界面不追求企业后台的密集，也不使用幼态插画掩盖路线、费用或隐私等真实信息。

**Key Characteristics:**

- 米白纸张底色、暖黑文字和克制的珊瑚橙行动色。
- 清晰的大标题、充足留白和容易扫读的内容层次。
- 柔和圆角卡片承载复杂协作信息，但不把每句话都装进卡片。
- 手机和电脑共享同一任务顺序，布局随屏幕重排而不是简单缩小。
- 地图、投票和推荐状态真实、可解释、可恢复。

## Colors

整体色彩温暖而克制；珊瑚橙负责行动，路线色负责数据，暖色中性色负责阅读。

### Primary

- **会面珊瑚橙**：用于每屏最重要的主按钮、当前关键进度和少量强调数字。
- **深珊瑚橙**：用于主按钮悬停和按下状态，保持清晰反馈。

**The One Action Rule.** 同一视区只允许一个珊瑚橙主行动；其他操作使用次级或文字按钮。

### Secondary

- **路线苔绿**：表示成功、已完成和一类地图路线，不代替主行动色。
- **路线蓝**：用于另一类地图路线、链接或可区分的数据系列。

### Neutral

- **暖墨黑**：正文、标题和关键数值。
- **柔和灰褐**：辅助说明、时间、地址和次要标签；不得用于必须阅读的关键提示。
- **城市纸白**：全局页面背景，提供 PPT 式温暖纸张感。
- **纯白表面**：卡片、输入框和浮层。
- **暖灰分隔线**：卡片边界、分割线和输入框静止边框。

**The Honest Map Rule.** 地图和路线颜色表达数据类别或状态，不为了装饰随意使用。

## Typography

**Display Font:** PingFang SC（Microsoft YaHei、Segoe UI、sans-serif 回退）  
**Body Font:** PingFang SC（Microsoft YaHei、Segoe UI、sans-serif 回退）

**Character:** 使用可靠的系统中文字体，通过字号、字重和留白复现参考 PPT 的编辑感，避免为了形式引入不稳定的网络字体。数字采用等宽数字特性，以便路线时间和票数稳定对齐。

### Hierarchy

- **Display**（700，响应式大字号，1.08 行高）：首页和关键阶段的主标题；手机端仍需完整可读，不挤压主操作。
- **Headline**（700，响应式中大字号，1.2 行高）：页面标题和结果确认。
- **Title**（650，20px，1.4 行高）：卡片标题、候选地点和弹窗标题。
- **Body**（400，16px，1.7 行高）：说明和表单文本；长文单行宽度控制在约 65–75 个字符内。
- **Label**（600，13px，轻微字距）：字段名、状态和辅助导航；关键文本不得小于 12px。

**The Readable Mobile Rule.** 手机端不通过把正文压到 8–10px 来换取空间；应改为重排、折叠次要内容或允许滚动。

## Layout

桌面端使用居中的宽容器，地图与决策信息形成主次两栏；手机端改为单栏任务流，主操作、地图、候选结果和投票状态按操作顺序排列。常用内容间距遵循 8px 基础节奏，区域之间至少保留 24px。

桌面断点以现有 1200px、900px 和 700px 行为为基础；700px 以下进入明确的移动布局，380px 左右验证最窄常用设备。触控目标至少 44px 高，导航和弹窗不得遮挡地图或提交按钮。

**The Same Journey Rule.** 手机和电脑必须完成相同业务流程；允许改变排列和展开方式，不得隐藏核心功能。

## Elevation & Depth

采用轻卡片层次。默认卡片通过白色表面、暖灰边框和极淡环境阴影从米白背景中分离；弹窗和地图详情可使用更明确但仍柔和的阴影。悬停变化以颜色和边框为主，避免元素跳动。

### Shadow Vocabulary

- **卡片环境阴影**（`0 6px 24px rgba(31, 25, 26, 0.06)`）：普通信息卡片和活动卡片。
- **浮层阴影**（`0 16px 48px rgba(31, 25, 26, 0.14)`）：弹窗、地图详情和移动端底部面板。

**The Quiet Depth Rule.** 阴影只表达层级，不用厚重黑影制造装饰效果。

## Shapes

组件采用柔和圆角：小控件 10px、按钮和输入框 12px、内容卡片与弹窗 16px。圆角保持一致但不过度；头像和明确的点状状态可以使用圆形。边框使用单像素暖灰线，地图选中态可增加清晰外框。

## Components

### Buttons

- **Shape:** 柔和矩形（12px 圆角），默认高度至少 44px。
- **Primary:** 珊瑚橙底、白字；只用于当前最重要的下一步。
- **Hover / Focus:** 悬停加深；键盘焦点使用高对比外框且不依赖颜色变化。
- **Secondary / Ghost:** 白底暖灰边框或透明文字按钮，危险操作独立使用危险色并要求明确文案。

### Chips

- **Style:** 10px 圆角的小型标签，浅色底、深色字；用于交通方式、推荐类型和状态。
- **State:** 选中态增加边框与字重，不只改变底色。

### Cards / Containers

- **Corner Style:** 柔和大圆角（16px）。
- **Background:** 纯白表面置于城市纸白背景上。
- **Shadow Strategy:** 默认使用卡片环境阴影；嵌套内容优先使用分隔线而不是继续套卡片。
- **Border:** 单像素暖灰边框。
- **Internal Padding:** 手机 16px，桌面常用 24px。

### Inputs / Fields

- **Style:** 白底、暖灰边框、12px 圆角、至少 44px 高；标签常驻，不能只靠占位符说明。
- **Focus:** 珊瑚橙或高对比外框，保持可见。
- **Error / Disabled:** 错误文本说明具体原因；禁用态降低强调但保持文字可读。

### Navigation

桌面使用清晰的顶部导航，当前项以文字字重和短色条共同标识。手机使用紧凑菜单或底部任务导航，标签必须可读；当前状态不能只靠颜色表达。

### Recommendation Card

候选地点卡片先展示地点名称、推荐组别、预计时间与公平度，再提供“为什么推荐”和投票操作。未知费用明确写“暂不可用”，不以假数字补齐。手机端按一张一张纵向阅读，电脑端可并列比较。

## Do's and Don'ts

### Do:

- **Do** 使用大标题、短说明和明确主按钮引导单一下一步。
- **Do** 在推荐和投票界面直接解释公平度、路线时间、费用未知和失败原因。
- **Do** 分别在桌面宽屏和约 390px 手机宽度验证完整流程。
- **Do** 为加载、无结果、超时、配额不足和路线不可用提供可恢复操作。
- **Do** 保持正文和触控目标在真实手机上可读、可点。

### Don't:

- **Don't** 在同一视区放置多个同等醒目的珊瑚橙按钮。
- **Don't** 用大量小字号、胶囊和嵌套卡片压缩复杂信息。
- **Don't** 用装饰性示意图冒充真实高德地图或路线结果。
- **Don't** 在其他成员视角泄露未授权公开的具体出发地。
- **Don't** 为了与 PPT 相似而复制不适合交互界面的超大文字或纯展示布局。
