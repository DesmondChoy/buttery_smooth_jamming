# Workflow Patterns

Design patterns for multi-step processes and conditional logic in skills.

## Sequential Workflows

For tasks with clear step-by-step processes:

```markdown
## Process

### Step 1: Gather Input
- Collect required information
- Validate inputs

### Step 2: Process
- Execute main logic
- Handle edge cases

### Step 3: Output
- Format results
- Verify output quality
```

## Conditional Workflows

When the path depends on context:

```markdown
## Workflow Selection

**If creating new document:**
1. Use template from `assets/template.docx`
2. Fill in required fields
3. Save to specified location

**If editing existing document:**
1. Read current content
2. Apply modifications
3. Preserve formatting

**If converting format:**
1. Parse source format
2. Transform to target schema
3. Validate output
```

## Decision Trees

For complex branching logic:

```markdown
## Decision Flow

┌─ Is file large (>10MB)?
│  ├─ Yes → Use streaming approach
│  └─ No → Load into memory
│
├─ Is format supported?
│  ├─ Yes → Process directly
│  └─ No → Convert first or error
│
└─ Is output directory writable?
   ├─ Yes → Save result
   └─ No → Report error with suggestion
```

## State Management

For workflows that maintain state:

```markdown
## State Tracking

Track these through the workflow:
- `current_step`: Which step we're on
- `accumulated_results`: Results from previous steps
- `error_count`: Failures encountered
- `user_confirmations`: Decisions made by user

### Recovery
If interrupted:
1. Check last completed step
2. Validate accumulated state
3. Resume from last checkpoint
```

## Iteration Patterns

For tasks requiring repetition:

```markdown
## Batch Processing

For each item in the input:
1. Validate item
2. Process item
3. Collect result
4. Report progress

### Error Handling
- Continue on recoverable errors
- Stop on critical failures
- Summarize all errors at end
```
