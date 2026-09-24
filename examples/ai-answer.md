# A compact answer about resilient publishing

An AI-generated report is easier to share when its text and code remain selectable. **Review the source** before publishing.

> A share link is a bearer capability. Anyone who receives it can forward it.

## Checklist

- [x] Render Markdown locally
- [x] Inspect possible sensitive strings
- [ ] Decide whether to localize external images

## Trade-offs

| Output          | Strength              | Limit                    |
| --------------- | --------------------- | ------------------------ |
| Screenshot      | Preserves pixels      | Hard to copy code        |
| Markdown file   | Portable source       | Reader needs a renderer  |
| AnswerDrop page | Readable in a browser | Host stores the document |

## Commands

```bash
npm run build
answerdrop preview examples/ai-answer.md
```

```python
def share(title: str) -> str:
    return f"Ready: {title}"

print(share("AI answer"))
```

Inline math works: $E = mc^2$.

$$
\sum_{i=1}^{n} i = \frac{n(n+1)}{2}
$$

## Image

![Example architecture diagram](https://example.org/answerdrop-diagram.png)

The image URL above is intentionally illustrative. It will be a non-loading placeholder unless replaced with a real public image and localized.

## Privacy scanner demo

The following are **fake examples**, included only to exercise scanner rules. Redact or explicitly ignore each before publishing:

- Local path: `/Users/example/reports/draft.md`
- Private IP: `192.168.42.7`
- Email: `author@example.invalid`
- Fake token candidate: `ghp_EXAMPLEONLYNOTAVALIDTOKEN1234567890`
