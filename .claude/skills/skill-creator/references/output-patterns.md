# Output Patterns

Design patterns for templates, examples, and structured output in skills.

## Template Patterns

### Basic Template with Placeholders

```markdown
## Output Format

Generate output following this template:

---
Title: {{title}}
Date: {{date}}
Author: {{author}}

## Summary
{{summary}}

## Details
{{details}}
---
```

### Template with Conditional Sections

```markdown
## Report Template

# {{report_title}}

## Executive Summary
{{summary}}

{{#if has_warnings}}
## Warnings
{{warnings}}
{{/if}}

## Results
{{results}}

{{#if has_recommendations}}
## Recommendations
{{recommendations}}
{{/if}}
```

## Example-Driven Patterns

### Input/Output Examples

Show Claude what good output looks like:

```markdown
## Examples

**Input:** "Convert 100 USD to EUR"
**Output:**
```json
{
  "amount": 100,
  "from": "USD",
  "to": "EUR",
  "result": 92.50,
  "rate": 0.925
}
```

**Input:** "What's the weather in Paris?"
**Output:**
```json
{
  "location": "Paris, France",
  "temperature": 18,
  "unit": "celsius",
  "conditions": "partly cloudy"
}
```
```

### Edge Case Examples

```markdown
## Edge Cases

**Empty input:**
- Return: `{"error": "No input provided"}`

**Invalid format:**
- Return: `{"error": "Invalid format", "expected": "..."}`

**Partial data:**
- Return available data with `"incomplete": true` flag
```

## Structured Output Patterns

### JSON Schema Definition

```markdown
## Output Schema

```json
{
  "type": "object",
  "required": ["status", "data"],
  "properties": {
    "status": {"enum": ["success", "error"]},
    "data": {"type": "object"},
    "errors": {"type": "array", "items": {"type": "string"}}
  }
}
```
```

### Markdown Structure

```markdown
## Output Structure

Always format output as:

# [Main Title]

## Overview
Brief summary of results.

## Details
- **Key 1:** Value 1
- **Key 2:** Value 2

## Next Steps
1. First action
2. Second action
```

## Quality Standards

### Validation Checklist

```markdown
## Output Validation

Before returning output, verify:
- [ ] All required fields are present
- [ ] Data types are correct
- [ ] No placeholder values remain
- [ ] Format matches specification
- [ ] Content is complete
```

### Error Output Pattern

```markdown
## Error Format

When errors occur, return:

```json
{
  "status": "error",
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": "Technical details if applicable",
    "suggestion": "How to fix"
  }
}
```
```
