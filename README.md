# galgame-yingxiongtanshuo

《旮旯给木 · 英雄坛说》角色卡的前端界面资源。

- `index.html` —— 楼层状态栏面板（时间 / 四天赋与派生值 / 技能与反哺预览 / 资源 / 她的状态 / 战斗结果）

由酒馆正则 `状态栏界面` 通过 jsDelivr 加载：

```
$('body').load('https://testingcf.jsdelivr.net/gh/fkgzs123321/galgame-yingxiongtanshuo@<commit>/index.html')
```

改动后重新提交，并把卡里的 commit 号换掉即可。
