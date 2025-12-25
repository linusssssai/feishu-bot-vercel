【A. Interactions API（核心文档）】

1) Interactions API 文档（开发者指南）
https://ai.google.dev/gemini-api/docs/interactions
说明：Interactions API 的总览与使用方式；讲它如何统一模型与 agent 的交互、状态管理、工具编排、长任务等。 (Beta)  :contentReference[oaicite:0]{index=0}

2) Interactions API API Reference（接口/Schema 级别）
https://ai.google.dev/api/interactions-api
说明：更偏“接口定义与字段说明”，适合 Claude Code 写集成代码时对照。 :contentReference[oaicite:1]{index=1}

3) 官方博客：Interactions API 发布介绍
https://blog.google/technology/developers/interactions-api/
说明：产品层面的设计意图与能力边界；也会提到 Deep Research agent、public beta 等。 :contentReference[oaicite:2]{index=2}


【B. Deep Research Agent（如果你要把“研究型 agent”当能力模块接进来）】

4) Deep Research Agent 文档（开发者指南）
https://ai.google.dev/gemini-api/docs/deep-research
说明：Deep Research agent 如何做多步研究、引用、用 web search + 自有数据产出报告；通常通过 Interactions API 来调用。 :contentReference[oaicite:3]{index=3}

5) 官方博客：Build with Gemini Deep Research
https://blog.google/technology/developers/deep-research-agent-gemini-api/
说明：Deep Research 的产品与开发者视角解读，强调用 Interactions API 作为“下一代接口”来接入。 :contentReference[oaicite:4]{index=4}

6) Google Developers Blog：用 ADK + Interactions API 构建 Agents
https://developers.googleblog.com/building-agents-with-the-adk-and-the-new-interactions-api/
说明：更偏“工程落地模式”，包括把 Interactions API 作为自定义 agent 的推理引擎、以及把 Deep Research 作为远程 agent（A2A）协作等。 :contentReference[oaicite:5]{index=5}


【C. Gemini 3 Flash（模型文档 / 系列总览）】

7) Gemini 3 系列开发者指南（含 Flash 3）
https://ai.google.dev/gemini-api/docs/gemini-3
说明：Gemini 3 系列的总览入口，包含 Flash/Pro/Nano Banana Pro 的定位与 API 侧说明；Flash 对应模型名 gemini-3-flash-preview。 :contentReference[oaicite:6]{index=6}

8) Vertex AI 上的 Gemini 3 Flash 文档（如果你走 GCP/Vertex 线路）
https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-flash
说明：Vertex AI 侧的模型信息（例如 gemini-3-flash-preview、发布阶段、区域、参数等）。 :contentReference[oaicite:7]{index=7}

9) 官方博客：Gemini 3 Flash 发布文章（产品侧）
https://blog.google/products/gemini/gemini-3-flash/
说明：Gemini 3 Flash 的定位与核心卖点（速度、能力、覆盖平台等）；适合理解“官方怎么定义它”。 :contentReference[oaicite:8]{index=8}


【D. Cookbook / 示例（给 Claude Code“照抄改造”的材料）】

10) Gemini API Cookbook（GitHub 仓库，总入口）
https://github.com/google-gemini/cookbook
说明：官方示例与教程集合（Colab / notebooks / guide），适合 Claude Code 直接参考并搬到你的项目里。 :contentReference[oaicite:9]{index=9}

11) Cookbook Quickstart：Get started（Colab）
https://colab.research.google.com/github/google-gemini/cookbook/blob/main/quickstarts/Get_started.ipynb
说明：最短路径跑通 SDK 安装、基本调用、system instruction、文本/多模态提示等。 :contentReference[oaicite:10]{index=10}


【E. 基础总索引（你要查 SDK / REST / streaming 等）】

12) Gemini API Reference 总入口
https://ai.google.dev/api
说明：Gemini API 的标准/流式/实时接口的总索引，写工程集成时常用。 :contentReference[oaicite:11]{index=11}
