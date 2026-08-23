# Git、提交与代码评审

> 本课帮助读者快速看懂代码仓库、Issue、Pull Request、测试结果和事故通告中的常见英文。概念解释只用于理解工程材料，不教授软件开发或项目管理本身。

---

## 1. 从需求到发布的词汇地图

常见开发流程可以帮助定位术语：

`requirement` → `issue` → `change` → `review` → `test` → `release`

- `requirement`：需求或必须满足的条件；
- `acceptance criteria`：用于确认需求是否满足的验收条件；
- `issue`：待跟踪的问题，可以是缺陷、任务或建议；
- `change`：一次代码或配置变更；
- `review`：对变更进行审查；
- `release`：对外提供的版本；
- `deployment`：把某个版本放入运行环境的过程。

`release` 和 `deploy` 不完全相同：版本可以已经部署但尚未向用户发布，也可以先发布安装包而不由团队直接部署。

`The change has been deployed but is not yet available to all users.`

---

## 2. Repository 与 Git 高频词

`repository` 常缩写为 `repo`，指保存项目文件和版本历史的仓库。

- `working tree`：当前看到和编辑的文件；
- `staging area` 或 `index`：准备进入下一次提交的内容；
- `commit`：带有作者、时间和说明的历史记录；
- `branch`：指向一条开发历史的分支名称；
- `tag`：通常用于标记某个固定版本；
- `remote`：另一个可同步的仓库位置。

常见动作搭配：

- `clone a repository`
- `create / switch branches`
- `stage changes`
- `commit changes`
- `push to a remote`
- `pull the latest changes`
- `merge a branch`
- `resolve a conflict`
- `revert a commit`

`checkout` 在 Git 中可表示切换分支或恢复文件，具体含义要看命令对象。较新的材料也常使用更明确的 `switch` 和 `restore`。

`Please rebase your branch and resolve the remaining conflicts.`

`merge` 把历史合并；`rebase` 把一组提交重新放到另一个基点上；`cherry-pick` 选取特定提交。阅读评论时知道这层区别即可。

---

## 3. Commit 与 Pull Request

`commit message` 是提交说明，常使用简短命令式动词：

- `Fix duplicate submissions`
- `Add retry handling`
- `Remove deprecated option`
- `Preserve sidebar height`

`pull request`（PR）或 `merge request`（MR）是请求团队审查并合并变更的协作对象。

PR 中常见栏目：

- `summary`：变更摘要；
- `motivation / context`：为什么需要变更；
- `implementation`：实现方式；
- `testing`：已经做过的验证；
- `risk`：可能出现的问题；
- `rollout`：如何逐步发布；
- `rollback`：如何撤回；
- `breaking change`：可能破坏现有用法的变化。

`This pull request fixes a race condition in the upload handler.`

`No user-facing behavior is expected to change.`

---

## 4. Code review 中的语气

评审评论经常使用不同强度：

- `Blocking:`：合并前必须处理；
- `Suggestion:`：建议，但不一定阻塞；
- `Question:`：确认理解或询问背景；
- `Nit:`：很小的风格问题；
- `Looks good to me`（LGTM）：评审者认为可以接受。

常见礼貌句型：

`Could we return early here to make the failure path clearer?`

`This may expose the token in shared logs.`

`Would you mind adding a test for the empty-input case?`

`could / may / would` 可以缓和语气，但评论仍应明确指出条件和影响。`This is wrong` 没有提供足够工程信息。

回应评论时常见：

- `Good catch. Fixed in the latest commit.`
- `I have added a regression test.`
- `This is intentional because...`
- `I agree with the concern, but...`
- `Let's handle this in a follow-up issue.`

---

## 5. Bug report 与复现信息

`bug`、`defect` 和 `issue` 都可能表示问题。`issue` 最宽泛，不一定是程序错误。

缺陷报告常见栏目：

- `summary`：问题概述；
- `environment`：版本、平台和配置；
- `steps to reproduce`：复现步骤；
- `expected behavior`：预期行为；
- `actual behavior`：实际行为；
- `frequency`：出现频率；
- `workaround`：临时规避方法；
- `impact / severity`：影响和严重程度。

`The page becomes unresponsive after the sidebar is collapsed twice.`

`This issue occurs consistently on version 4.2.0.`

`reproduce` 是“复现问题”，不是重新生产产品。`intermittent` 表示间歇出现；`deterministic` 表示相同条件下稳定出现相同结果。

---

## 6. Test、build 与 CI

`test case` 是测试情形；`test suite` 是一组测试；`assertion` 检查结果是否符合预期。

- `unit test`：针对较小代码单元；
- `integration test`：检查多个组件协作；
- `end-to-end test`（E2E）：从用户或系统入口检查完整路径；
- `regression test`：防止已经修复的问题再次出现；
- `flaky test`：在代码不变时仍不稳定通过的测试。

常见状态：

- `tests pass / fail`
- `a build succeeds / fails`
- `the pipeline is running`
- `the job was canceled`
- `the step timed out`
- `the check was skipped`

`continuous integration`（CI）通常指频繁合并变更并自动运行检查。`artifact` 是构建产生并需要保存或传递的文件；`cache` 是为了加速而复用、通常可以重新生成的数据。

`The build failed because two integration tests timed out.`

---

## 7. 错误和日志中的英文

高频故障词：

- `error`：错误或失败信息；
- `exception`：程序运行中抛出的异常对象；
- `failure`：某个操作没有成功；
- `warning`：值得注意但未必导致失败；
- `stack trace`：函数调用路径和异常位置；
- `root cause`：被认定的根本原因；
- `workaround`：暂时绕开的办法；
- `fix`：修复；
- `mitigation`：降低当前影响的措施。

常见句型：

- `failed to connect to...`
- `permission denied`
- `file not found`
- `request timed out`
- `connection was reset`
- `unexpected token at line...`
- `out of memory`
- `service unavailable`

`Failed to parse the configuration file: expected a closing bracket at line 18.`

`caused by` 引出下层原因；`triggered by` 强调触发事件；`correlated with` 只说明同时变化，不直接断言因果。

---

## 8. 版本、兼容和弃用

`version` 是版本；`release` 是提供给用户的一次发布。常见版本词：

- `major / minor / patch release`
- `stable / beta / preview version`
- `latest version`
- `long-term support`（LTS）
- `release candidate`（RC）

`backward compatible` 通常表示新版本仍能支持旧用法或旧数据；`breaking change` 表示现有调用方可能需要修改。

`deprecated` 表示仍可使用但不再推荐，并计划在未来移除；`removed` 表示已经删除。二者不能混译成同一个状态。

`This option is deprecated and will be removed in the next major release.`

迁移材料中常见：

- `upgrade to version...`
- `migrate from A to B`
- `replace A with B`
- `no longer supported`
- `remain compatible with...`
- `follow the migration guide`

---

## 9. Incident 与状态通告

`incident` 是影响系统或用户、需要协调处理的事件。状态页常用：

- `investigating`：正在调查；
- `identified`：已确认问题；
- `monitoring`：已采取措施并观察恢复；
- `resolved`：已解决；
- `degraded performance`：性能下降；
- `partial outage`：部分不可用；
- `service disruption`：服务中断或受扰。

`We are investigating elevated error rates in the EU region.`

`A mitigation has been applied, and we are monitoring recovery.`

`postmortem` 或 `incident report` 是事后报告；`timeline`、`impact`、`contributing factors` 和 `follow-up actions` 是常见栏目。

---

## 10. 本课回看

- repository、commit、branch、merge 和 conflict 属于版本控制语境。
- PR 描述变更、验证、风险和兼容性；review 评论常明确 blocking、suggestion 或 question。
- bug report 使用 reproduce、expected、actual、environment、impact 和 workaround。
- test、build、pipeline、job、artifact 和 cache 常出现在 CI 材料中。
- error、exception、timeout、permission denied 和 stack trace 常出现在日志与报错中。
- deprecated、breaking change、migration 和 backward compatible 用于版本演进。
- incident 通告使用 investigating、monitoring、resolved 和 degraded performance 等状态词。

### 延伸资料

- [Git 官方参考文档](https://git-scm.com/docs)
- [Git workflows](https://git-scm.com/docs/gitworkflows.html)
