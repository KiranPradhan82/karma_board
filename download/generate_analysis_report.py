import sys, os
sys.path.insert(0, '/home/z/my-project/skills/pdf/scripts')

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib.units import inch, cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

# ━━ Font Registration ━━
pdfmetrics.registerFont(TTFont('Carlito', '/usr/share/fonts/truetype/english/Carlito-Regular.ttf'))
pdfmetrics.registerFont(TTFont('CarlitoBold', '/usr/share/fonts/truetype/english/Carlito-Bold.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSerif', '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf'))
registerFontFamily('Carlito', normal='Carlito', bold='CarlitoBold')
registerFontFamily('DejaVuSerif', normal='DejaVuSerif', bold='DejaVuSerif')

# ━━ Color Palette ━━
ACCENT       = colors.HexColor('#bd344b')
TEXT_PRIMARY  = colors.HexColor('#242321')
TEXT_MUTED    = colors.HexColor('#87847b')
BG_SURFACE   = colors.HexColor('#e7e5e1')
TABLE_HEADER_COLOR = ACCENT
TABLE_HEADER_TEXT  = colors.white
TABLE_ROW_EVEN     = colors.white
TABLE_ROW_ODD      = BG_SURFACE

# ━━ Styles ━━
title_style = ParagraphStyle(
    name='Title', fontName='DejaVuSerif', fontSize=26, leading=32,
    textColor=TEXT_PRIMARY, alignment=TA_LEFT, spaceAfter=6
)
h1_style = ParagraphStyle(
    name='H1', fontName='DejaVuSerif', fontSize=18, leading=24,
    textColor=TEXT_PRIMARY, alignment=TA_LEFT, spaceBefore=18, spaceAfter=10
)
h2_style = ParagraphStyle(
    name='H2', fontName='DejaVuSerif', fontSize=14, leading=20,
    textColor=ACCENT, alignment=TA_LEFT, spaceBefore=14, spaceAfter=8
)
h3_style = ParagraphStyle(
    name='H3', fontName='DejaVuSerif', fontSize=12, leading=17,
    textColor=TEXT_PRIMARY, alignment=TA_LEFT, spaceBefore=10, spaceAfter=6
)
body_style = ParagraphStyle(
    name='Body', fontName='DejaVuSerif', fontSize=10.5, leading=17,
    textColor=TEXT_PRIMARY, alignment=TA_JUSTIFY, spaceAfter=6
)
bullet_style = ParagraphStyle(
    name='Bullet', fontName='DejaVuSerif', fontSize=10.5, leading=17,
    textColor=TEXT_PRIMARY, alignment=TA_LEFT, leftIndent=20, bulletIndent=8,
    spaceAfter=4
)
code_style = ParagraphStyle(
    name='Code', fontName='DejaVuSans', fontSize=9, leading=14,
    textColor=colors.HexColor('#333333'), alignment=TA_LEFT,
    leftIndent=16, spaceAfter=4, backColor=colors.HexColor('#f5f4f3')
)
caption_style = ParagraphStyle(
    name='Caption', fontName='DejaVuSerif', fontSize=9, leading=13,
    textColor=TEXT_MUTED, alignment=TA_CENTER, spaceBefore=3, spaceAfter=6
)
header_cell_style = ParagraphStyle(
    name='HeaderCell', fontName='DejaVuSerif', fontSize=10,
    textColor=colors.white, alignment=TA_CENTER
)
cell_style = ParagraphStyle(
    name='Cell', fontName='DejaVuSerif', fontSize=9.5,
    textColor=TEXT_PRIMARY, alignment=TA_LEFT, leading=14
)
cell_center_style = ParagraphStyle(
    name='CellCenter', fontName='DejaVuSerif', fontSize=9.5,
    textColor=TEXT_PRIMARY, alignment=TA_CENTER, leading=14
)
severity_high = ParagraphStyle(
    name='SevHigh', fontName='DejaVuSerif', fontSize=9.5,
    textColor=ACCENT, alignment=TA_CENTER, leading=14
)
severity_med = ParagraphStyle(
    name='SevMed', fontName='DejaVuSerif', fontSize=9.5,
    textColor=colors.HexColor('#b45309'), alignment=TA_CENTER, leading=14
)
severity_low = ParagraphStyle(
    name='SevLow', fontName='DejaVuSerif', fontSize=9.5,
    textColor=colors.HexColor('#15803d'), alignment=TA_CENTER, leading=14
)

available_width = A4[0] - 1.0*inch - 1.0*inch

def make_table(data, col_ratios=None):
    if col_ratios:
        col_widths = [r * available_width for r in col_ratios]
    else:
        col_widths = None
    t = Table(data, colWidths=col_widths, hAlign='CENTER')
    style_commands = [
        ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
        ('TEXTCOLOR', (0, 0), (-1, 0), TABLE_HEADER_TEXT),
        ('GRID', (0, 0), (-1, -1), 0.5, TEXT_MUTED),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]
    for i in range(1, len(data)):
        bg = TABLE_ROW_EVEN if i % 2 == 1 else TABLE_ROW_ODD
        style_commands.append(('BACKGROUND', (0, i), (-1, i), bg))
    t.setStyle(TableStyle(style_commands))
    return t

# ━━ Build Document ━━
doc = SimpleDocTemplate(
    '/home/z/my-project/download/Karma_Space_Root_Cause_Analysis.pdf',
    pagesize=A4,
    leftMargin=1.0*inch, rightMargin=1.0*inch,
    topMargin=0.8*inch, bottomMargin=0.8*inch,
    title='Karma Space AI Root Cause Analysis',
    author='Z.ai',
    subject='Share Sathi Chat History Analysis and Permanent Solutions'
)

story = []

# ━━ COVER ━━
story.append(Spacer(1, 140))
story.append(Paragraph('<b>Karma Space AI</b>', title_style))
story.append(Spacer(1, 8))
story.append(Paragraph('<b>Root Cause Analysis Report</b>', ParagraphStyle(
    name='Subtitle', fontName='DejaVuSerif', fontSize=16, leading=22,
    textColor=TEXT_MUTED, alignment=TA_LEFT
)))
story.append(Spacer(1, 24))

# Decorative line
line_data = [['']]
line_table = Table(line_data, colWidths=[120])
line_table.setStyle(TableStyle([
    ('LINEBELOW', (0, 0), (-1, 0), 2, ACCENT),
    ('TOPPADDING', (0, 0), (-1, -1), 0),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
]))
story.append(line_table)
story.append(Spacer(1, 24))

meta_style = ParagraphStyle(name='Meta', fontName='DejaVuSerif', fontSize=11, leading=17, textColor=TEXT_MUTED)
story.append(Paragraph('<b>Subject:</b> Share Sathi Project Chat History Analysis', meta_style))
story.append(Spacer(1, 6))
story.append(Paragraph('<b>Date:</b> June 7, 2026', meta_style))
story.append(Spacer(1, 6))
story.append(Paragraph('<b>Prepared for:</b> Kiran Pradhan (Super Admin)', meta_style))
story.append(Spacer(1, 6))
story.append(Paragraph('<b>Classification:</b> Internal Technical Analysis', meta_style))

story.append(Spacer(1, 80))
story.append(Paragraph(
    'This report provides a comprehensive root cause analysis of the issues identified in the Share Sathi project chat history '
    'within Karma Space AI. It covers 7 distinct issues observed across 16 pages of chat logs, traces each issue to its exact '
    'origin in the codebase, and proposes permanent solutions with code-level specifics.',
    ParagraphStyle(name='SummaryText', fontName='DejaVuSerif', fontSize=10.5, leading=17, textColor=TEXT_MUTED, alignment=TA_JUSTIFY)
))

story.append(PageBreak())

# ━━ 1. EXECUTIVE SUMMARY ━━
story.append(Paragraph('<b>1. Executive Summary</b>', h1_style))
story.append(Paragraph(
    'The Share Sathi project chat history reveals 7 distinct categories of issues spanning configuration failures, model hallucination, '
    'encoding corruption, vision API errors, and context management failures. After thorough analysis of the complete Karma Space '
    'codebase (8 core files, approximately 4,000+ lines of code across API routes, system prompts, model configuration, tool definitions, '
    'tool execution, and frontend components), the root causes have been traced to specific code-level failures in 5 key areas: '
    'model fallback prioritization, anti-hallucination filtering, vision API validation, tool input validation, and system prompt design.',
    body_style
))
story.append(Paragraph(
    'The single most impactful root cause is the <b>DeepSeek V3.1 model being ranked as the highest-priority fallback</b> in the '
    'fallback chain (priority 1 out of 14 models). When the primary model (GLM-4-Flash) encounters rate limits or errors, the system '
    'automatically routes to DeepSeek V3.1 via SambaNova. This model, while powerful (671 billion parameters, Mixture of Experts), '
    'exhibits severe hallucination tendencies in the Karma Space context: it fabricates GitHub push actions, references wrong projects, '
    'discusses spirituality when instructed not to, and generates garbled text. The anti-hallucination filter is a regex-based post-processing '
    'step that catches only 3 specific patterns and cannot prevent the model from generating misleading content throughout the response.',
    body_style
))

story.append(Spacer(1, 12))

# Issue summary table
story.append(Paragraph('<b>Issue Summary</b>', h3_style))
story.append(Spacer(1, 6))

issue_data = [
    [Paragraph('<b>#</b>', header_cell_style),
     Paragraph('<b>Issue</b>', header_cell_style),
     Paragraph('<b>Severity</b>', header_cell_style),
     Paragraph('<b>Root Cause</b>', header_cell_style),
     Paragraph('<b>Status</b>', header_cell_style)],
    [Paragraph('1', cell_center_style), Paragraph('API Key not configured', cell_style),
     Paragraph('HIGH', severity_high), Paragraph('Missing env vars in Vercel', cell_style),
     Paragraph('Fixed (June 2)', cell_center_style)],
    [Paragraph('2', cell_center_style), Paragraph('Garbled/corrupted text', cell_style),
     Paragraph('HIGH', severity_high), Paragraph('DeepSeek V3.1 encoding + PDF extraction', cell_style),
     Paragraph('Active', cell_center_style)],
    [Paragraph('3', cell_center_style), Paragraph('AI ignores user identity', cell_style),
     Paragraph('MEDIUM', severity_med), Paragraph('Fallback model ignores system prompt', cell_style),
     Paragraph('Active', cell_center_style)],
    [Paragraph('4', cell_center_style), Paragraph('Vision API 400 error', cell_style),
     Paragraph('HIGH', severity_high), Paragraph('Non-multimodal fallback for vision', cell_style),
     Paragraph('Active', cell_center_style)],
    [Paragraph('5', cell_center_style), Paragraph('Spirituality hallucination', cell_style),
     Paragraph('MEDIUM', severity_med), Paragraph('Fallback ignores prompt guardrails', cell_style),
     Paragraph('Active', cell_center_style)],
    [Paragraph('6', cell_center_style), Paragraph('Fake project creation', cell_style),
     Paragraph('CRITICAL', severity_high), Paragraph('No tool input validation + hallucination', cell_style),
     Paragraph('Active', cell_center_style)],
    [Paragraph('7', cell_center_style), Paragraph('Generic/low-quality docs', cell_style),
     Paragraph('MEDIUM', severity_med), Paragraph('Insufficient project context', cell_style),
     Paragraph('Active', cell_center_style)],
]
story.append(make_table(issue_data, [0.06, 0.22, 0.10, 0.36, 0.10]))
story.append(Spacer(1, 4))
story.append(Paragraph('Table 1: Issue Summary for Share Sathi Chat History', caption_style))

story.append(PageBreak())

# ━━ 2. DETAILED ISSUE ANALYSIS ━━
story.append(Paragraph('<b>2. Detailed Issue Analysis</b>', h1_style))

# Issue 1
story.append(Paragraph('<b>2.1 Issue #1: AI_API_KEY Not Configured</b>', h2_style))
story.append(Paragraph(
    'On June 2, 2026 at 06:17, when the user typed <font name="DejaVuSans" size="9">/docs</font>, the AI responded with: '
    '"I encountered an issue connecting to the AI service: AI_API_KEY environment variable is not configured." This was a '
    'straightforward configuration gap. The Vercel deployment at that time lacked the necessary environment variables for any '
    'AI provider API keys. The code correctly detects missing configuration through the <font name="DejaVuSans" size="9">isAiConfigured()</font> '
    'function in <font name="DejaVuSans" size="9">ai-models.ts</font>, which checks for 8 different provider-specific environment variables. '
    'When none are found, the <font name="DejaVuSans" size="9">getProviderConfig()</font> function returns an empty API key, causing the HTTP '
    'request to the AI provider to fail with an authentication error. This issue was resolved by adding the ZAI_API_KEY environment variable '
    'to the Vercel project settings, though it illustrates a fragile dependency on external provider configuration.',
    body_style
))

# Issue 2
story.append(Paragraph('<b>2.2 Issue #2: Garbled and Corrupted Text in Documents</b>', h2_style))
story.append(Paragraph(
    'Throughout the chat history, particularly on June 2 (13:32) and June 3 (08:26), the generated documents contain severely corrupted '
    'text. Characters appear as mojibake such as sequences like garbled Unicode characters replacing bullet points, feature names, and '
    'technical terms. For example, "Fetch Nepse daily updates" becomes a series of unreadable characters, and technical stack references '
    'like "React or Angular" are similarly corrupted. This pattern is consistent with encoding issues in model output, specifically when '
    'the DeepSeek V3.1 model generates responses that contain unusual Unicode codepoints which then fail to render correctly during '
    'PDF extraction from the stored database content. The garbled text appears in the PDF extraction output (which uses pypdf text '
    'extraction), suggesting the corruption may also be in how the content is stored or rendered rather than solely in the model output.',
    body_style
))
story.append(Paragraph(
    'The root cause is two-fold: first, DeepSeek V3.1 (as the top fallback model) may generate non-standard Unicode characters that are '
    'valid in its internal representation but corrupt when transmitted through the SambaNova API response. Second, the content is stored '
    'as plain text in the SQLite database without any encoding validation or sanitization. When the PDF generation function '
    '<font name="DejaVuSans" size="9">generatePdfBase64()</font> processes this content, any corrupted Unicode characters either render as '
    'tofu blocks or cause garbled output in the extracted text. The system lacks a content sanitization layer between model output '
    'and database storage.',
    body_style
))

# Issue 3
story.append(Paragraph('<b>2.3 Issue #3: AI Does Not Recognize User Identity</b>', h2_style))
story.append(Paragraph(
    'On June 2 at 14:39, when asked "what is my name", the AI responded: "Your name is not explicitly mentioned in our conversation so '
    'far. However, I do have some context about the project you are working on. According to the project context, the client name is '
    'Kiran Pradhan, but I do not have any information about your name." This is incorrect because the user IS Kiran Pradhan, who is both '
    'the Super Admin and the project lead. The code at line 314-325 of <font name="DejaVuSans" size="9">route.ts</font> correctly loads the '
    'user name from the database and passes it to <font name="DejaVuSans" size="9">buildSystemPrompt()</font> at line 399-412. The system '
    'prompt at line 731 of <font name="DejaVuSans" size="9">ai-prompts.ts</font> instructs: "Always address the user by their first name: '
    '<b>Kiran</b>". The prompt also passes the project context showing "Client: Kiran Pradhan" and the user role as "Super Admin".',
    body_style
))
story.append(Paragraph(
    'The root cause is that the model responding to this message was likely a fallback model (DeepSeek V3.1 or Llama 3.3 70B via SambaNova) '
    'that does not reliably follow system prompt instructions. These models tend to rely more on their training distribution than on the '
    'provided system context, leading them to "forget" user identity even when explicitly stated in the prompt. The system prompt tells the '
    'AI the user name, but weaker instruction-following models may override this with generic responses. A secondary contributing factor is '
    'that the system prompt injects the user name but does not include an explicit instruction like "The user speaking to you right now IS '
    '<b>${firstName}</b> - they are the same person as the client/lead listed above."',
    body_style
))

# Issue 4
story.append(Paragraph('<b>2.4 Issue #4: Vision API 400 Error</b>', h2_style))
story.append(Paragraph(
    'On June 2 at 18:00, when the user sent "Generate a picture of god Vishnu" along with an image attachment, the AI returned: '
    '"I encountered an issue analyzing the image: Vision API returned status 400: messages[1].content must be a string." This error '
    'indicates that the model receiving the vision request does not support the multimodal content format (array of objects with type and '
    'image_url fields), and instead expects a plain string content. Looking at the code flow: when images are attached, '
    '<font name="DejaVuSans" size="9">visionCompletion()</font> is called at line 523 with a multimodal content array. The vision model '
    'is resolved via <font name="DejaVuSans" size="9">getVisionModel()</font> at line 447. However, the auto-routing logic at lines '
    '449-472 may switch the active model to a different provider that does not support multimodal input. The fallback chain in '
    '<font name="DejaVuSans" size="9">callWithFallback()</font> at line 543-591 can further switch the model on error, potentially '
    'selecting a non-vision model.',
    body_style
))
story.append(Paragraph(
    'The critical gap is that <font name="DejaVuSans" size="9">callWithFallback()</font> does not check whether the fallback model supports '
    'vision. It only checks the <font name="DejaVuSans" size="9">tools</font> feature flag (line 561), not the <font name="DejaVuSans" size="9">vision</font> '
    'flag. When the fallback system tries DeepSeek V3.1 or Llama 3.3 70B (neither of which supports vision), the API rejects the '
    'multimodal content array with a 400 error. Additionally, the <font name="DejaVuSans" size="9">getFallbackModels()</font> function '
    'at line 722 accepts an optional <font name="DejaVuSans" size="9">requiredFeatures</font> parameter, but the callWithFallback function '
    'does not pass <font name="DejaVuSans" size="9">vision: true</font> when handling image attachments. This means the fallback chain '
    'will happily switch to a non-vision model, causing the 400 error.',
    body_style
))

story.append(PageBreak())

# Issue 5
story.append(Paragraph('<b>2.5 Issue #5: Spirituality Hallucination</b>', h2_style))
story.append(Paragraph(
    'On June 2 at 18:01, when the user asked "what is karma space", the AI launched into a 5-paragraph explanation of "Karma Space" '
    'as a "virtual or metaphysical realm where the principles of karma are believed to operate" - complete with discussions of '
    'energetic realms, interconnectedness, causality, timelessness, and multidimensionality. This directly violates the system prompt '
    'rule #1 at line 770: "Never discuss spirituality, religion, or metaphysical concepts of karma." The prompt explicitly states: '
    '"Karma Space is an agentic AI assistant within KarmaBoard" and "Karma in KarmaBoard refers to the concept of tracking work actions '
    'and their outcomes." The correct answer should have been: "Karma Space is the AI assistant within KarmaBoard that helps you generate '
    'project documentation and manage your projects."',
    body_style
))
story.append(Paragraph(
    'The root cause is the same as Issues #3 and #6: the model responding was a fallback model (likely DeepSeek V3.1 or a SambaNova model) '
    'that does not reliably follow system prompt instructions. DeepSeek V3.1, despite its high parameter count, has been observed to '
    'override explicit system instructions when the user query triggers a strong association in its training data. The phrase "karma space" '
    'has a strong association with spiritual/mystical concepts in the training data, which overrides the system prompt instruction. '
    'The anti-hallucination filter at lines 744-767 of route.ts does not catch spirituality-related hallucinations because it only targets '
    'fake action claims (pushed code, deployments), not content-topic violations.',
    body_style
))

# Issue 6
story.append(Paragraph('<b>2.6 Issue #6: Fake Project Creation with Wrong Data</b>', h2_style))
story.append(Paragraph(
    'On June 3 at 08:42, the AI stated: "Created project Share Sathi with MEDIUM priority. Deadline: 2024-03-31." This has three '
    'separate problems. First, the AI claimed to create a project that already existed (the Share Sathi project was already created, '
    'as evidenced by the chat header showing "Status: ACTIVE"). Second, the deadline is wrong: the existing project has a deadline of '
    '2026-07-01, but the AI used 2024-03-31, a date nearly 2 years in the past at the time of the conversation. Third, the AI called '
    'the <font name="DejaVuSans" size="9">create_project</font> tool (indicated by the tool execution happening), but the tool accepted '
    'the wrong deadline without validation, leading to a duplicate project with incorrect data in the database.',
    body_style
))
story.append(Paragraph(
    'The root cause has two components. On the AI model side: the AI hallucinated the deadline instead of using the actual project '
    'deadline provided in the system prompt context (line 799-808 of ai-prompts.ts injects the project deadline). The fallback model '
    'did not cross-reference the system prompt context when calling the tool. On the tool executor side: the <font name="DejaVuSans" size="9">'
    'createProject()</font> function in <font name="DejaVuSans" size="9">ai-tool-executor.ts</font> performs no input validation beyond '
    'basic type checking. It does not check for duplicate project names, validate that deadlines are in the future, or verify that the '
    'project does not already exist. This allows the AI to create duplicate projects with fabricated data.',
    body_style
))

# Issue 7
story.append(Paragraph('<b>2.7 Issue #7: Generic, Low-Quality Documents</b>', h2_style))
story.append(Paragraph(
    'Across all document generations (/docs, /ux, /plan, /schema), the output is consistently generic and uses vague language like '
    '"React or Angular", "Python or Java", "MySQL or MongoDB", and "Express or Django" instead of making specific technology recommendations. '
    'The project description is only "Creating a website to fetch nepse daily updates and post the update on facebook page" - a single '
    'sentence that provides minimal context for generating detailed technical documents. The AI fills in the gaps with generic '
    'boilerplate content rather than asking clarifying questions or making specific recommendations based on the project requirements.',
    body_style
))
story.append(Paragraph(
    'The root cause is primarily insufficient project context. The system prompt injects only 7 fields: name, description, client, status, '
    'priority, deadline, and team count. For document generation, this is extremely sparse. The AI has no information about preferred '
    'tech stack, deployment target, design preferences, or specific features. Additionally, the document prompts instruct the AI to '
    '"START WRITING IMMEDIATELY" (line 913 of ai-prompts.ts), which discourages the AI from asking clarifying questions before generating. '
    'When combined with a weak fallback model, the result is generic boilerplate that could apply to any project.',
    body_style
))

story.append(PageBreak())

# ━━ 3. ROOT CAUSE DEEP DIVE ━━
story.append(Paragraph('<b>3. Root Cause Deep Dive: Code-Level Analysis</b>', h1_style))

story.append(Paragraph('<b>3.1 The Primary Root Cause: DeepSeek V3.1 Fallback Priority</b>', h2_style))
story.append(Paragraph(
    'The single most impactful root cause across all 7 issues is the DeepSeek V3.1 model being ranked as the highest-priority fallback '
    'in both the auto-routing quality order and the fallback quality order. In <font name="DejaVuSans" size="9">ai-models.ts</font> '
    'line 643, the quality order defines <font name="DejaVuSans" size="9">"DeepSeek-V3.1": 1</font>, making it the #1 priority model. '
    'Similarly, in the <font name="DejaVuSans" size="9">getFallbackModels()</font> function at line 735, '
    '<font name="DejaVuSans" size="9">"DeepSeek-V3.1": 1</font> is again ranked first. This means that whenever the primary model (GLM-4-Flash '
    'for docs, or the global default model for regular chat) fails with a 4xx/5xx error, the system immediately tries DeepSeek V3.1.',
    body_style
))
story.append(Paragraph(
    'DeepSeek V3.1 is a 671-billion parameter Mixture of Experts model served via SambaNova. While its raw benchmark scores are impressive, '
    'it exhibits several problematic behaviors in the Karma Space context. First, it has poor instruction-following reliability for '
    'complex system prompts - it tends to override system instructions when the user query triggers strong associations in its training '
    'data. Second, it generates non-standard Unicode characters that cause mojibake in stored content. Third, it fabricates actions '
    '(claiming to push code, create repos) even when no tool calls are made. Fourth, it has no vision capability, yet the fallback chain '
    'does not filter it out for vision requests. The model was likely ranked #1 because of its benchmark quality, but benchmark scores '
    'do not reliably predict instruction-following reliability in production agentic systems.',
    body_style
))

story.append(Paragraph('<b>3.2 Weak Anti-Hallucination Filter</b>', h2_style))
story.append(Paragraph(
    'The anti-hallucination filter at lines 744-767 of <font name="DejaVuSans" size="9">route.ts</font> is a post-processing step that '
    'uses 3 regex patterns to detect fake action claims. The patterns catch: (1) claims about pushing/committing/deploying code, '
    '(2) stalling phrases like "stand by" or "please wait", and (3) fake build/deployment success messages. These patterns are then '
    'replaced with note strings like "[Note: This action was not actually performed.]". While this filter catches the most egregious '
    'hallucinations, it has severe limitations. It only triggers when NO git/file tools were executed (line 758), meaning if ANY tool '
    'was called (even an unrelated one like list_projects), the filter is completely disabled. It uses hardcoded project names like '
    '"Share Sathi" (line 764), which is not scalable and only catches that specific project name. Most importantly, it cannot detect '
    'hallucinations about project details, wrong deadlines, spiritual content, or garbled text.',
    body_style
))

story.append(Paragraph('<b>3.3 Vision Fallback Lacks Feature Validation</b>', h2_style))
story.append(Paragraph(
    'The <font name="DejaVuSans" size="9">callWithFallback()</font> function at line 543 of <font name="DejaVuSans" size="9">route.ts</font> '
    'accepts feature flags for tools but NOT for vision. At line 561, it calls <font name="DejaVuSans" size="9">getFallbackModels(model, '
    '{tools: !!tools, vision: false})</font> - notice that <font name="DejaVuSans" size="9">vision</font> is hardcoded to '
    '<font name="DejaVuSans" size="9">false</font>. This means when a vision request fails and the fallback chain activates, it will '
    'try non-vision models like DeepSeek V3.1 or Llama 3.3 70B, which cannot handle multimodal content and will return a 400 error. '
    'The <font name="DejaVuSans" size="9">getFallbackModels()</font> function already supports vision filtering (line 759: '
    '<font name="DejaVuSans" size="9">if (requiredFeatures?.vision and !m.supportsVision) return false</font>), but the caller never '
    'passes this flag. This is a one-line fix that would prevent all vision-related 400 errors.',
    body_style
))

story.append(Paragraph('<b>3.4 No Tool Input Validation</b>', h2_style))
story.append(Paragraph(
    'The tool executor in <font name="DejaVuSans" size="9">ai-tool-executor.ts</font> performs RBAC checks and basic type validation, but '
    'does not validate the semantic correctness of tool inputs. For <font name="DejaVuSans" size="9">create_project</font>, it does not '
    'check for: duplicate project names (the same project can be created multiple times), past deadlines (a deadline of 2024-03-31 is '
    'accepted even when it is in the past), empty descriptions (a one-word description is accepted), or missing required fields. For '
    '<font name="DejaVuSans" size="9">github_push_code</font>, it does not validate that there are actually staged files to push. '
    'This means any hallucinated tool call from the AI model will be executed without validation, potentially creating duplicate projects, '
    'pushing empty commits, or saving incorrect GitHub configurations.',
    body_style
))

story.append(Paragraph('<b>3.5 Insufficient System Prompt Enforcement for Fallback Models</b>', h2_style))
story.append(Paragraph(
    'The system prompt in <font name="DejaVuSans" size="9">ai-prompts.ts</font> contains 15 rules (line 769-791) that are well-designed '
    'for instruction-following models like GLM-4-Flash and GPT-4o. However, fallback models like DeepSeek V3.1 and Llama 3.3 70B '
    'have varying levels of instruction-following capability. The current approach relies on the model to self-enforce all 15 rules, '
    'with only a weak post-processing filter as a safety net. For the most critical rules (anti-hallucination of actions, project '
    'scoping, and content topic restrictions), the system should not rely solely on the model but should also implement server-side '
    'validation. For example, instead of relying on the model to not fabricate GitHub pushes, the system should verify that a '
    '<font name="DejaVuSans" size="9">github_push_code</font> tool call actually occurred before allowing the response to mention '
    'any push-related language.',
    body_style
))

story.append(PageBreak())

# ━━ 4. PERMANENT SOLUTIONS ━━
story.append(Paragraph('<b>4. Permanent Solutions</b>', h1_style))

story.append(Paragraph('<b>4.1 Solution 1: Demote DeepSeek V3.1 and Restructure Fallback Priority</b>', h2_style))
story.append(Paragraph(
    '<b>Impact:</b> Resolves Issues #2, #3, #5, #6, #7 (5 of 7 issues). This is the highest-impact fix.',
    body_style
))
story.append(Paragraph(
    'Move DeepSeek V3.1 from priority 1 to priority 6 or lower in both the <font name="DejaVuSans" size="9">qualityOrder</font> '
    'object in <font name="DejaVuSans" size="9">findBestModelForPrompt()</font> (line 643) and the <font name="DejaVuSans" size="9">'
    'fallbackQuality</font> object in <font name="DejaVuSans" size="9">getFallbackModels()</font> (line 735). Replace it with '
    '<font name="DejaVuSans" size="9">glm-4-flash</font> as the top fallback, since GLM-4-Flash is free, has 128K context, 16K output, '
    'supports tools, and has excellent instruction-following. The new priority should be: (1) glm-4-flash, (2) gpt-4o, '
    '(3) Meta-Llama-3.3-70B-Instruct, (4) Llama-4-Maverick, (5) gpt-4o-mini, (6) DeepSeek-V3.1, (7) llama-3.3-70b-versatile. '
    'Additionally, add a reliability blacklist for models known to hallucinate in agentic contexts, so they are only used as a last resort.',
    body_style
))

story.append(Paragraph('<b>4.2 Solution 2: Fix Vision Fallback Feature Flag</b>', h2_style))
story.append(Paragraph(
    '<b>Impact:</b> Resolves Issue #4 (Vision API 400 error).',
    body_style
))
story.append(Paragraph(
    'In <font name="DejaVuSans" size="9">route.ts</font> line 561, change <font name="DejaVuSans" size="9">vision: false</font> to '
    '<font name="DejaVuSans" size="9">vision: hasImages</font>. This is a one-line fix that ensures the fallback chain only considers '
    'vision-capable models (GPT-4o, GPT-4o-mini, Gemini 2.0 Flash, Gemini 1.5 Flash, Gemini 1.5 Pro, GLM-4.6V) when processing '
    'image attachments. This prevents the system from switching to DeepSeek V3.1 or Llama models that cannot handle multimodal content.',
    body_style
))

story.append(Paragraph('<b>4.3 Solution 3: Add Server-Side Tool Input Validation</b>', h2_style))
story.append(Paragraph(
    '<b>Impact:</b> Resolves Issue #6 (Fake project creation) and prevents future data corruption.',
    body_style
))
story.append(Paragraph(
    'Add validation in <font name="DejaVuSans" size="9">ai-tool-executor.ts</font> for critical tool inputs. For '
    '<font name="DejaVuSans" size="9">create_project</font>: check if a project with the same name already exists and return an error '
    'if so; validate that the deadline is at least 7 days in the future; require a description of at least 10 characters. For '
    '<font name="DejaVuSans" size="9">github_push_code</font>: verify that staged files exist before attempting to push. For '
    '<font name="DejaVuSans" size="9">save_github_config</font>: validate that the PAT format looks correct before saving. These '
    'server-side validations act as a safety net regardless of which model is generating the tool calls.',
    body_style
))

story.append(Paragraph('<b>4.4 Solution 4: Enhance Anti-Hallucination Filter</b>', h2_style))
story.append(Paragraph(
    '<b>Impact:</b> Reduces impact of Issue #2 (garbled text), #5 (spirituality), #6 (fake actions).',
    body_style
))
story.append(Paragraph(
    'Expand the anti-hallucination filter beyond 3 regex patterns. Add: (1) Unicode sanitization to replace non-standard characters '
    'with their closest ASCII equivalent before storing content; (2) Content-topic validation that checks for spirituality keywords '
    '("metaphysical", "spiritual", "karma space is", "energetic realm") and replaces them with a redirect to the correct KarmaBoard '
    'definition; (3) Project name validation that ensures any mentioned project name matches the current project context; '
    '(4) Action-claim verification that checks if the response mentions any tool-executable action and verifies it against actual '
    'tool execution records. Move from a simple regex filter to a multi-stage validation pipeline.',
    body_style
))

story.append(Paragraph('<b>4.5 Solution 5: Improve Project Context for Document Generation</b>', h2_style))
story.append(Paragraph(
    '<b>Impact:</b> Resolves Issue #7 (generic/low-quality documents).',
    body_style
))
story.append(Paragraph(
    'Expand the project context injected into the system prompt for document generation. Currently, only 7 fields are injected. '
    'Add: team member names and roles, any previously generated documents (as summaries), the project description with more detail, '
    'client requirements if available, and any chat history where the user has expressed preferences. Additionally, modify the document '
    'generation prompt to instruct the AI to ask clarifying questions BEFORE generating if the project context is sparse (less than '
    '50 words of description). This gives the AI permission to ask questions rather than generating generic content.',
    body_style
))

story.append(Paragraph('<b>4.6 Solution 6: Strengthen User Identity in System Prompt</b>', h2_style))
story.append(Paragraph(
    '<b>Impact:</b> Resolves Issue #3 (AI ignores user identity).',
    body_style
))
story.append(Paragraph(
    'Add an explicit identity statement to the system prompt that is harder for fallback models to ignore. Instead of just saying '
    '"Always address the user by their first name: Kiran", add: "CRITICAL IDENTITY: The person you are talking to RIGHT NOW is '
    '<b>${firstName} ${lastName}</b> (${roleLabel}). They are the SAME person as the client/lead listed in the project context above. '
    'If they ask who they are, tell them their full name." Place this identity statement at the very beginning of the system prompt, '
    'before any other instructions, since models tend to follow instructions placed earlier in the prompt more reliably.',
    body_style
))

story.append(Paragraph('<b>4.7 Solution 7: Add Model Reliability Scoring</b>', h2_style))
story.append(Paragraph(
    '<b>Impact:</b> Prevents future issues from unreliable models across all projects.',
    body_style
))
story.append(Paragraph(
    'Implement a per-model reliability score that tracks success rates, hallucination rates, and user feedback. After each AI response, '
    'log the model used, whether tool calls were made (and validated), and whether the user accepted or rejected the response. '
    'Over time, models with high hallucination rates are automatically deprioritized in the fallback chain. This creates a feedback loop '
    'that adapts the model selection to actual production behavior rather than static benchmark scores. Store these scores in the Settings '
    'table and update them after each interaction. Display model reliability in the admin settings UI.',
    body_style
))

story.append(PageBreak())

# ━━ 5. IMPLEMENTATION PRIORITY ━━
story.append(Paragraph('<b>5. Implementation Priority Matrix</b>', h1_style))
story.append(Paragraph(
    'The following matrix provides a recommended implementation order based on impact, effort, and dependencies. Solutions that resolve '
    'multiple issues and require minimal code changes should be implemented first.',
    body_style
))

priority_data = [
    [Paragraph('<b>Priority</b>', header_cell_style),
     Paragraph('<b>Solution</b>', header_cell_style),
     Paragraph('<b>Effort</b>', header_cell_style),
     Paragraph('<b>Issues Fixed</b>', header_cell_style),
     Paragraph('<b>Files Changed</b>', header_cell_style)],
    [Paragraph('P0', severity_high), Paragraph('Demote DeepSeek V3.1', cell_style),
     Paragraph('15 min', cell_center_style), Paragraph('#2, #3, #5, #6, #7', cell_style),
     Paragraph('ai-models.ts', cell_style)],
    [Paragraph('P0', severity_high), Paragraph('Fix vision fallback flag', cell_style),
     Paragraph('2 min', cell_center_style), Paragraph('#4', cell_style),
     Paragraph('route.ts (1 line)', cell_style)],
    [Paragraph('P1', severity_med), Paragraph('Tool input validation', cell_style),
     Paragraph('2 hours', cell_center_style), Paragraph('#6', cell_style),
     Paragraph('ai-tool-executor.ts', cell_style)],
    [Paragraph('P1', severity_med), Paragraph('Enhanced anti-hallucination', cell_style),
     Paragraph('3 hours', cell_center_style), Paragraph('#2, #5, #6', cell_style),
     Paragraph('route.ts', cell_style)],
    [Paragraph('P2', ParagraphStyle(name='P2Low', fontName='DejaVuSerif', fontSize=9.5, textColor=TEXT_MUTED, alignment=TA_CENTER, leading=14)),
     Paragraph('Improved project context', cell_style),
     Paragraph('4 hours', cell_center_style), Paragraph('#7', cell_style),
     Paragraph('route.ts, ai-prompts.ts', cell_style)],
    [Paragraph('P2', ParagraphStyle(name='P2Low2', fontName='DejaVuSerif', fontSize=9.5, textColor=TEXT_MUTED, alignment=TA_CENTER, leading=14)),
     Paragraph('Strengthened user identity', cell_style),
     Paragraph('30 min', cell_center_style), Paragraph('#3', cell_style),
     Paragraph('ai-prompts.ts', cell_style)],
    [Paragraph('P3', ParagraphStyle(name='P3Low', fontName='DejaVuSerif', fontSize=9.5, textColor=TEXT_MUTED, alignment=TA_CENTER, leading=14)),
     Paragraph('Model reliability scoring', cell_style),
     Paragraph('8 hours', cell_center_style), Paragraph('All (long-term)', cell_style),
     Paragraph('route.ts, new files', cell_style)],
]
story.append(Spacer(1, 8))
story.append(make_table(priority_data, [0.08, 0.22, 0.10, 0.22, 0.24]))
story.append(Spacer(1, 4))
story.append(Paragraph('Table 2: Implementation Priority Matrix', caption_style))

story.append(Spacer(1, 18))
story.append(Paragraph(
    'The P0 fixes (Solution 1 and Solution 2) can be implemented in under 20 minutes and will resolve 6 of the 7 identified issues. '
    'The P1 fixes add critical safety nets that prevent future data corruption and reduce hallucination impact. The P2 and P3 fixes '
    'are quality-of-life improvements that enhance the user experience but are not strictly necessary to prevent the issues observed '
    'in the Share Sathi chat history. The recommended approach is to implement P0 immediately, then P1 within the same week, and '
    'schedule P2/P3 for the following sprint.',
    body_style
))

# ━━ 6. CONCLUSION ━━
story.append(Paragraph('<b>6. Conclusion</b>', h1_style))
story.append(Paragraph(
    'The Share Sathi chat history reveals that the Karma Space AI system has a fundamental architectural vulnerability: its model '
    'fallback chain prioritizes a model (DeepSeek V3.1) that consistently fails to follow system prompt instructions, fabricates '
    'actions, generates garbled text, and provides generic output. The anti-hallucination filter, while well-intentioned, is too '
    'narrow and too late (post-processing vs. prevention) to catch the majority of hallucination patterns. The vision fallback lacks '
    'feature validation, causing 400 errors when image attachments trigger a model switch. Tool input validation is absent, allowing '
    'hallucinated data to be written to the database.',
    body_style
))
story.append(Paragraph(
    'The good news is that the codebase is well-structured and the fixes are straightforward. The two P0 solutions (demoting DeepSeek '
    'V3.1 and fixing the vision fallback flag) require changing approximately 4 lines of code across 2 files and will immediately '
    'resolve 6 of the 7 identified issues. The remaining solutions add defense-in-depth layers that will prevent similar issues '
    'from recurring with any model. The system already has the right architecture (agentic tool-calling, provider fallback, anti-'
    'hallucination filter) - it just needs better tuning of the model priority and stronger validation layers.',
    body_style
))

# ━━ Build ━━
doc.build(story)
print("Report generated successfully: /home/z/my-project/download/Karma_Space_Root_Cause_Analysis.pdf")
