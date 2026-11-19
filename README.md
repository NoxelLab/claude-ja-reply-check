# claude-ja-reply-check

Claude Code の日本語以外の返答を日本語で書き直させる Stop フック

ターンの最後の返答を確かめ、日本語でなければ一度だけ Claude に差し戻します。\
「日本語で返答する」という指示が守られなかった際の確認として使うことを想定しています。

## 導入

Node.js 18 以上が必要です。

Claude Code で次のコマンドを 1 行ずつ実行します。

```
/plugin marketplace add NoxelLab/claude-ja-reply-check
/plugin install ja-reply-check@ja-reply-check
/reload-plugins
```

プラグインを使わない場合は `hooks/ja-reply-check.mjs` を任意の場所に置き、\
`~/.claude/settings.json` に次のように登録します。

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"/path/to/ja-reply-check.mjs\"",
            "timeout": 15
          }
        ]
      }
    ]
  }
}
```

## 動作

Claude が返答を終えて止まる時点で最後の返答を判定します。\
コードの囲み、インラインコード、URL を除いて文字を数え、\
英字が 40 字以上あり日本語の文字（ひらがな、カタカナ、漢字）が英字の 25% 未満であれば差し戻します。（基準の値は `hooks/ja-reply-check.mjs` 冒頭の `MIN_LATIN` と `MIN_RATIO`）

英語での返答や英語の文章を頼んだ場合も一度は差し戻されます。\
その場合は返答し直さず、直前の返答のままとすることを日本語で一文だけ伝えるよう Claude に指示します。

次の場合は差し戻しません。

- 同じターンですでに一度差し戻している場合
- 判定中にエラーが起きた場合

外部との通信は行いません。

## ライセンス

MIT（[LICENSE](LICENSE)）。
