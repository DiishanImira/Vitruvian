# Design Engine PRD & Implementation Spec

**Version:** 2.0
**Status:** Ready for Implementation
**Last Updated:** January 2026

---

## Table of Contents

1. [Overview](#1-overview)
2. [User Flow](#2-user-flow)
3. [Campaigns & Channels](#3-campaigns--channels)
4. [Data Model](#4-data-model)
5. [Template System](#5-template-system)
6. [Rendering Technology](#6-rendering-technology)
7. [API Design](#7-api-design)
8. [Storage](#8-storage)
9. [Implementation Plan](#9-implementation-plan)
10. [Dependencies](#10-dependencies)
11. [Error Handling](#11-error-handling)
12. [Testing Checklist](#12-testing-checklist)

---

## 1. Overview

### 1.1 Purpose

The Design Engine transforms raw client photos/videos from the Content Bank into professionally designed marketing assets ready for social media publishing. One raw asset generates multiple designed outputs across different campaigns and channels.

### 1.2 Value Proposition

- **For Stylists:** One-click generation of professional marketing assets without design skills
- **For the Platform:** Foundation for AutoPilot automated social media publishing
- **Business Impact:** Increases content utilization and reduces time-to-publish

### 1.3 Scope

**In Scope (MVP):**
- Generate up to 9 designed images per source IMAGE
- Generate up to 6 designed videos per source VIDEO
- 3 campaign types with conditional logic
- 5 channel formats (3 image, 2 video)
- Parameterized JSON templates with data binding
- Server-side rendering with Sharp (images) and FFmpeg (videos)
- Storage to existing object storage system

**Out of Scope (MVP):**
- AI-generated captions/descriptions
- Multiple template style choices per campaign
- Client-side template editor
- Real-time preview during editing

---

## 2. User Flow

### 2.1 Visual Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CONTENT BANK                                    │
│                                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Asset 1   │  │   Asset 2   │  │   Asset 3   │  │   Asset 4   │        │
│  │  [image]    │  │  [video]    │  │  [image]    │  │  [video]    │        │
│  │             │  │             │  │             │  │             │        │
│  │[Design Asset]  │[Design Asset]  │[Design Asset]  │[Design Asset]        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ User clicks "Design Asset"
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         RENDERING ENGINE (Server)                           │
│                                                                             │
│  1. Fetch asset data (asset + submission + stylist)                        │
│  2. Determine applicable campaigns:                                         │
│     - Hair Showcase (always)                                                │
│     - Business Showcase (always)                                            │
│     - Social Proof (only if rating + review_text exists)                   │
│  3. Determine applicable channels based on media type:                      │
│     - IMAGE → Story, Feed, Pinterest Image                                  │
│     - VIDEO → Reel, Pinterest Video                                         │
│  4. Render each campaign × channel combination                              │
│  5. Save each rendered file to object storage                               │
│  6. Create designed_assets records                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ Rendering complete
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DESIGNED ASSETS PAGE                              │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Hair Showcase                                                        │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                          │   │
│  │  │  Story   │  │   Feed   │  │ Pinterest│                          │   │
│  │  │          │  │          │  │          │                          │   │
│  │  │[Publish] │  │[Publish] │  │[Publish] │                          │   │
│  │  └──────────┘  └──────────┘  └──────────┘                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Business Showcase                                                    │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                          │   │
│  │  │  Story   │  │   Feed   │  │ Pinterest│                          │   │
│  │  │          │  │          │  │          │                          │   │
│  │  │[Publish] │  │[Publish] │  │[Publish] │                          │   │
│  │  └──────────┘  └──────────┘  └──────────┘                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 User Journey

1. **Stylist reviews Content Bank** — Views all photos/videos from client submissions
2. **Clicks "Design Asset"** — On any asset card (replaces old "Add to Designed Assets" button)
3. **System generates designs** — Loading indicator shown during rendering
4. **Designs appear in Designed Assets page** — Ready for publishing
5. **Stylist clicks "Publish"** — On any designed asset card

### 2.3 Key Behavior

- Designs are **snapshots** — if source data changes, existing designs are NOT auto-updated
- User can delete old designs and regenerate if needed
- Each raw asset can only be designed once (prevents duplicates)

---

## 3. Campaigns & Channels

### 3.1 Campaigns

| Campaign | Description | Condition | Top Text | Bottom Text |
|----------|-------------|-----------|----------|-------------|
| `hair_showcase` | Features stylist's work | Always | Stylist name (script font) | Service type, "Styled for {client}", CTA |
| `business_showcase` | Promotes the business | Always | Business name (script font) | Service type, City, CTA |
| `social_proof` | Client testimonial | Only if `rating` AND `review_text` exist | Business name (script font) | Stars, Review quote, Client name, CTA |

### 3.2 Channels by Media Type

| Media Type | Channels | Dimensions | File Format |
|------------|----------|------------|-------------|
| IMAGE | `story` | 1080×1920 | PNG |
| IMAGE | `feed` | 1080×1350 | PNG |
| IMAGE | `pinterest_image` | 1000×1500 | PNG |
| VIDEO | `reel` | 1080×1920 | MP4 |
| VIDEO | `pinterest_video` | 1080×1920 | MP4 |

### 3.3 Output Matrix

**For an IMAGE asset with a review:**
| Campaign | story | feed | pinterest_image |
|----------|-------|------|-----------------|
| hair_showcase | ✓ | ✓ | ✓ |
| business_showcase | ✓ | ✓ | ✓ |
| social_proof | ✓ | ✓ | ✓ |

**Total: 9 designed assets**

**For an IMAGE asset without a review:**
| Campaign | story | feed | pinterest_image |
|----------|-------|------|-----------------|
| hair_showcase | ✓ | ✓ | ✓ |
| business_showcase | ✓ | ✓ | ✓ |
| social_proof | ✗ | ✗ | ✗ |

**Total: 6 designed assets**

**For a VIDEO asset with a review:**
| Campaign | reel | pinterest_video |
|----------|------|-----------------|
| hair_showcase | ✓ | ✓ |
| business_showcase | ✓ | ✓ |
| social_proof | ✓ | ✓ |

**Total: 6 designed assets**

**For a VIDEO asset without a review:**
| Campaign | reel | pinterest_video |
|----------|------|-----------------|
| hair_showcase | ✓ | ✓ |
| business_showcase | ✓ | ✓ |
| social_proof | ✗ | ✗ |

**Total: 4 designed assets**

### 3.4 CTA Text by Channel

| Channel | CTA Text |
|---------|----------|
| `story` | "TAP TO BOOK" |
| `feed` | "COMMENT BOOK FOR LINK" |
| `pinterest_image` | "TAP TO BOOK" |
| `reel` | "COMMENT BOOK FOR LINK" |
| `pinterest_video` | "TAP TO BOOK" |

---

## 4. Data Model

### 4.0 AI Vision Analysis (Pre-Processing Step)

Before the Design Engine runs, each asset undergoes AI vision analysis **upon submission**. This happens when the client submits content, not at design time.

#### Flow
```
Client Submission → Upload to Storage → AI Vision Analysis → Store JSON Blob → Asset Ready for Content Bank
```

#### Trigger Point
- **When:** Immediately after asset is uploaded and saved to the `assets` table
- **Where:** In the submission processing pipeline (after file upload, before returning success)
- **What:** Send image (or video frame) to AI vision model for analysis

#### Database Migration Required

Add new column to `assets` table:

```sql
ALTER TABLE assets ADD COLUMN ai_analysis JSONB;
```

#### Schema Update (Drizzle)

```typescript
// In server/src/db/schema.ts
export const assets = pgTable('assets', {
  // ... existing columns ...
  aiAnalysis: jsonb('ai_analysis'),  // NEW: AI vision analysis results
});
```

#### Analysis Output Structure (TBD)

The exact fields to capture will be determined, but may include:

```json
{
  "analyzed_at": "2026-01-21T12:00:00Z",
  "model": "claude-3-sonnet",
  "model_version": "20260101",

  "hair": {
    "style": "silk press",
    "length": "medium",
    "color": "black",
    "texture": "straight",
    "condition": "healthy"
  },

  "image": {
    "quality_score": 0.92,
    "lighting": "good",
    "focus": "sharp",
    "composition": "portrait",
    "background": "neutral"
  },

  "subject": {
    "pose": "front-facing",
    "framing": "head-and-shoulders"
  },

  "suggestions": {
    "caption": "Sleek silk press perfection...",
    "hashtags": ["#silkpress", "#healthyhair", "#hairgoals"],
    "mood": "professional"
  },

  "detected_service_type": "Silk Press",
  "confidence": 0.95
}
```

#### Implementation Location

Create new service:
```
server/src/services/ai-analysis/
├── index.ts           # Main entry: analyzeAsset(assetId)
├── vision-client.ts   # AI API client (Claude/OpenAI)
└── types.ts           # Analysis result interfaces
```

#### Future Uses
- **Auto-fill service_type:** If stylist didn't specify, use `detected_service_type`
- **Caption generation:** Use `suggestions.caption` and `suggestions.hashtags` for publishing
- **Quality gating:** Flag low-quality images before they enter Content Bank
- **Smart template selection:** Choose templates based on image composition
- **Search/filtering:** Find assets by hair style, color, etc.

#### Integration with Design Engine
The `ai_analysis` JSON is available in the render context but **not currently used by templates**. This is future-ready data.

---

### 4.1 Data Sources for Rendering

The renderer joins data from 3 tables:

```
┌─────────────────────────────────────────────────────────────────┐
│                         assets                                   │
├─────────────────────────────────────────────────────────────────┤
│ id, media_url, media_type, service_type, rating, review_text,   │
│ submission_id, stylist_id                                        │
└───────────────────────────────┬─────────────────────────────────┘
                                │ submission_id
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       submissions                                │
├─────────────────────────────────────────────────────────────────┤
│ id, client_name                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        stylists                                  │
├─────────────────────────────────────────────────────────────────┤
│ id, first_name, last_name, business_name, city                   │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Template Data Context

Templates reference data using dot notation:

```javascript
{
  stylists: {
    first_name: "Jasmine",
    last_name: "Williams",
    display_name: "Jasmine Williams",  // Computed: first_name + " " + last_name
    business_name: "Glow Studio",
    city: "Atlanta"
  },
  assets: {
    media_url: "/api/storage/objects/abc123",
    media_type: "IMAGE",
    service_type: "Silk Press",
    rating: 5,
    review_text: "Amazing work! Best stylist I've ever had."
  },
  submissions: {
    client_name: "Michelle Johnson",
    client_first_name: "Michelle"  // Computed: first word of client_name
  }
}
```

### 4.3 Designed Assets Table (Existing)

The `designed_assets` table already exists with the correct schema:

```sql
designed_assets
├── id                 UUID (PK)
├── stylist_id         UUID (FK → stylists)
├── raw_asset_id       UUID (FK → assets, nullable)
├── design_media_url   TEXT (path to rendered file: /api/storage/objects/{uuid})
├── media_type         VARCHAR ('IMAGE' | 'VIDEO')
├── caption            TEXT (nullable, for future use)
├── hashtags           TEXT (nullable, for future use)
├── booking_link       VARCHAR (nullable)
├── campaign           VARCHAR ('hair_showcase' | 'business_showcase' | 'social_proof')
├── channel            VARCHAR ('instagram_feed' | 'instagram_story' | 'instagram_reel' | 'pinterest')
├── status             VARCHAR ('generated' | 'approved' | 'rejected' | 'published' | 'failed')
├── template_id        VARCHAR (e.g., 'hair_showcase/story')
├── metadata           JSONB (template version, render time, etc.)
├── error_message      TEXT (if status = 'failed')
├── published_at       TIMESTAMP
├── created_at         TIMESTAMP
├── updated_at         TIMESTAMP
```

**Channel Mapping:**
| Internal Channel | DB Channel Value |
|-----------------|------------------|
| `story` | `instagram_story` |
| `feed` | `instagram_feed` |
| `reel` | `instagram_reel` |
| `pinterest_image` | `pinterest` |
| `pinterest_video` | `pinterest` |

---

## 5. Template System

### 5.1 Template Storage

Templates are JSON files stored in:

```
server/templates/
├── hair_showcase/
│   ├── story.json
│   ├── feed.json
│   ├── pinterest_image.json
│   ├── reel.json
│   └── pinterest_video.json
├── business_showcase/
│   ├── story.json
│   ├── feed.json
│   ├── pinterest_image.json
│   ├── reel.json
│   └── pinterest_video.json
└── social_proof/
    ├── story.json
    ├── feed.json
    ├── pinterest_image.json
    ├── reel.json
    └── pinterest_video.json
```

**Note:** These 15 template files already exist.

### 5.2 Template JSON Structure

```json
{
  "template": {
    "id": "hair_showcase_story",
    "name": "Hair Showcase - Story",
    "campaign": "hair_showcase",
    "channel": "story",
    "assetType": "IMAGE",
    "style": "natural_beauty",
    "version": "1.0"
  },
  "canvas": {
    "width": 1080,
    "height": 1920
  },
  "layers": [
    {
      "id": "hero-image",
      "type": "image",
      "source": "assets.media_url",
      "position": { "x": 0, "y": 0 },
      "size": { "width": 1080, "height": 1920 },
      "fit": "cover",
      "anchor": "top"
    },
    {
      "id": "gradient-top",
      "type": "gradient",
      "position": { "x": 0, "y": 0 },
      "size": { "width": 1080, "height": 576 },
      "gradient": {
        "type": "linear",
        "angle": 180,
        "stops": [
          { "color": "rgba(26,22,18,0.85)", "position": 0 },
          { "color": "rgba(26,22,18,0)", "position": 100 }
        ]
      }
    },
    {
      "id": "stylist-name",
      "type": "text",
      "source": "stylists.display_name",
      "position": { "x": 540, "y": 130 },
      "typography": {
        "font": "Great Vibes",
        "size": 72,
        "color": "#FFFDF9",
        "weight": "400",
        "align": "center"
      },
      "anchor": "center",
      "shadow": { "x": 0, "y": 3, "blur": 15, "color": "rgba(0,0,0,0.6)" }
    }
  ]
}
```

### 5.3 Layer Types

| Type | Description | Key Properties |
|------|-------------|----------------|
| `image` | Hero image from asset | `source`, `fit: "cover"`, `anchor: "top"` |
| `gradient` | Linear gradient overlay | `gradient.stops`, `gradient.angle` |
| `text` | Dynamic or static text | `source` OR `content`, `typography`, `prefix`, `suffix` |
| `rectangle` | Solid fill or stroke (decorative lines) | `fill`, `stroke`, `strokeWidth` |
| `overlay` | Color overlay with blend mode | `color`, `blendMode` |
| `rating` | Star rating display | `source`, `starSize`, `starColor`, `starSpacing` |

### 5.4 Image Fit Strategy

**Cover fit with top anchor:**
- Scale image to completely fill the canvas (no letterboxing)
- Anchor to top edge (preserves hair/face in photos)
- Crop overflow from bottom

```
Original Image (3:4)          Canvas (9:16)
┌─────────────┐               ┌─────────┐
│  Hair/Face  │  ──────────►  │Hair/Face│  ← Preserved
│             │               │         │
│             │               │         │
│    Body     │               │  Body   │
│             │               │         │
│             │               └─────────┘
│    Feet     │                 ↑ Cropped
└─────────────┘
```

---

## 6. Rendering Technology

### 6.1 Image Rendering (Sharp)

For IMAGE assets, use **Sharp** (Node.js high-performance image processing):

```javascript
import sharp from 'sharp';

async function renderImageTemplate(template, data, sourceImageBuffer) {
  const { width, height } = template.canvas;

  // 1. Process hero image with cover fit + top anchor
  const heroImage = await sharp(sourceImageBuffer)
    .resize(width, height, {
      fit: 'cover',
      position: 'top'
    })
    .toBuffer();

  // 2. Start with hero image as base
  let composite = sharp(heroImage);

  // 3. Build composites array for overlay layers
  const overlays = [];

  for (const layer of template.layers) {
    if (layer.type === 'image') continue; // Already handled as base

    const layerBuffer = await renderLayer(layer, data, width, height);
    if (layerBuffer) {
      overlays.push({
        input: layerBuffer,
        top: layer.position.y,
        left: layer.position.x
      });
    }
  }

  // 4. Composite all overlays
  if (overlays.length > 0) {
    composite = composite.composite(overlays);
  }

  // 5. Output final image
  return composite.png().toBuffer();
}
```

### 6.2 Video Rendering (FFmpeg)

For VIDEO assets, use **FFmpeg** to overlay a transparent PNG onto the video:

```javascript
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execFileAsync = promisify(execFile);

async function renderVideoTemplate(template, data, sourceVideoPath) {
  const { width, height } = template.canvas;

  // 1. Render overlay image (all layers except hero-image)
  const overlayBuffer = await renderOverlayOnly(template, data);

  // 2. Write overlay to temp file
  const overlayPath = `/tmp/overlay_${Date.now()}.png`;
  await fs.writeFile(overlayPath, overlayBuffer);

  // 3. Generate output path
  const outputPath = `/tmp/output_${Date.now()}.mp4`;

  // 4. Run FFmpeg
  // Scale video to cover canvas, crop to exact dimensions, overlay PNG
  const ffmpegArgs = [
    '-i', sourceVideoPath,
    '-i', overlayPath,
    '-filter_complex',
    `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}:0:0[scaled];[scaled][1:v]overlay=0:0`,
    '-c:a', 'copy',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-y',
    outputPath
  ];

  await execFileAsync('ffmpeg', ffmpegArgs);

  // 5. Cleanup overlay temp file
  await fs.unlink(overlayPath);

  // 6. Return output path (caller will read and upload)
  return outputPath;
}
```

### 6.3 Text Rendering

Sharp doesn't have built-in text rendering. Options:

**Option A: SVG Text (Recommended for MVP)**
```javascript
function createTextSVG(text, typography, maxWidth) {
  const { font, size, color, weight, align } = typography;

  return `
    <svg width="${maxWidth}" height="${size * 2}">
      <text
        x="${align === 'center' ? maxWidth/2 : 0}"
        y="${size}"
        font-family="${font}"
        font-size="${size}"
        font-weight="${weight}"
        fill="${color}"
        text-anchor="${align === 'center' ? 'middle' : 'start'}"
      >${escapeXml(text)}</text>
    </svg>
  `;
}

// Convert SVG to buffer for compositing
const textBuffer = await sharp(Buffer.from(svgString)).png().toBuffer();
```

**Option B: node-canvas (Better font support)**
```javascript
import { createCanvas, registerFont } from 'canvas';

// Register fonts at startup
registerFont('server/assets/fonts/GreatVibes-Regular.ttf', { family: 'Great Vibes' });

function renderTextToBuffer(text, typography, width, height) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.font = `${typography.weight} ${typography.size}px "${typography.font}"`;
  ctx.fillStyle = typography.color;
  ctx.textAlign = typography.align;

  ctx.fillText(text, width/2, typography.size);

  return canvas.toBuffer('image/png');
}
```

---

## 7. API Design

### 7.1 Design Asset Endpoint

**POST** `/api/assets/:assetId/design`

Triggers the rendering engine for a single asset.

**Request:**
```
POST /api/assets/abc123/design
Authorization: Bearer {token}
```

No request body needed — all data is fetched from the asset.

**Response (Success):**
```json
{
  "success": true,
  "rawAssetId": "abc123",
  "designedAssets": [
    {
      "id": "design-uuid-1",
      "campaign": "hair_showcase",
      "channel": "instagram_story",
      "templateId": "hair_showcase/story",
      "designMediaUrl": "/api/storage/objects/designed-uuid-1",
      "mediaType": "IMAGE",
      "status": "generated"
    },
    {
      "id": "design-uuid-2",
      "campaign": "hair_showcase",
      "channel": "instagram_feed",
      "templateId": "hair_showcase/feed",
      "designMediaUrl": "/api/storage/objects/designed-uuid-2",
      "mediaType": "IMAGE",
      "status": "generated"
    }
    // ... more
  ],
  "stats": {
    "total": 9,
    "successful": 9,
    "failed": 0,
    "renderTimeMs": 3500
  }
}
```

**Response (Partial Success):**
```json
{
  "success": true,
  "rawAssetId": "abc123",
  "designedAssets": [...],
  "errors": [
    {
      "templateId": "social_proof/story",
      "error": "Font rendering failed"
    }
  ],
  "stats": {
    "total": 9,
    "successful": 8,
    "failed": 1,
    "renderTimeMs": 4200
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Asset not found"
}
```

### 7.2 Existing Endpoints (No Changes)

- **GET** `/api/designed-assets` — List all designed assets
- **GET** `/api/designed-assets/:id` — Get single designed asset
- **DELETE** `/api/designed-assets/:id` — Delete designed asset

---

## 8. Storage

### 8.1 File Organization

Rendered files are stored in object storage under the `designed/` prefix:

```
designed/
├── {uuid1}.png     # hair_showcase/story
├── {uuid2}.png     # hair_showcase/feed
├── {uuid3}.mp4     # hair_showcase/reel
└── ...
```

### 8.2 URL Pattern

Designed assets are accessible via the existing storage API:
```
/api/storage/objects/{uuid}
```

This URL is stored in `designed_assets.design_media_url`.

### 8.3 Upload Flow

```javascript
import { getStorageProvider } from '../services/storage/index.js';
import { randomUUID } from 'crypto';

async function saveDesignedAsset(buffer, mediaType) {
  const storage = getStorageProvider();
  const uuid = randomUUID();
  const key = `designed/${uuid}`;
  const contentType = mediaType === 'VIDEO' ? 'video/mp4' : 'image/png';

  const result = await storage.upload({
    key,
    data: buffer,
    contentType
  });

  if (!result.success) {
    throw new Error(`Storage upload failed: ${result.error}`);
  }

  return `/api/storage/objects/${uuid}`;
}
```

---

## 9. Implementation Plan

### Phase 0: AI Vision Analysis Service

**Pre-requisite:** This runs on submission, before assets reach Content Bank.

**Create directory structure:**
```
server/src/services/ai-analysis/
├── index.ts           # Main entry: analyzeAsset(assetId, mediaBuffer)
├── vision-client.ts   # AI API client (Claude Vision / OpenAI GPT-4V)
├── prompts.ts         # Analysis prompt templates
└── types.ts           # AIAnalysisResult interface
```

**Task breakdown:**

1. **types.ts** — Define `AIAnalysisResult` interface matching JSON schema above

2. **vision-client.ts**
   - `analyzeImage(imageBuffer: Buffer): Promise<AIAnalysisResult>`
   - `analyzeVideoFrame(videoPath: string): Promise<AIAnalysisResult>` (extract first frame)
   - Configure AI provider (Claude or OpenAI) via environment variable

3. **prompts.ts**
   - System prompt for hair/beauty analysis
   - Define what fields to extract
   - Ensure consistent JSON output format

4. **index.ts** — Main orchestrator
   - `analyzeAsset(assetId: string, mediaBuffer: Buffer, mediaType: 'IMAGE' | 'VIDEO'): Promise<void>`
   - Calls vision client
   - Updates `assets.ai_analysis` column with result

**Integration point:** Call `analyzeAsset()` in submission processing route after file upload succeeds.

**Environment variables:**
```bash
AI_VISION_PROVIDER=claude  # or 'openai'
ANTHROPIC_API_KEY=sk-...   # if using Claude
OPENAI_API_KEY=sk-...      # if using OpenAI
```

---

### Phase 1: Core Rendering Service

**Create directory structure:**
```
server/src/services/render-engine/
├── index.ts              # Main entry: designAsset(assetId, stylistId)
├── types.ts              # TypeScript interfaces
├── template-loader.ts    # Load/cache JSON templates
├── data-resolver.ts      # Fetch & format data from DB
├── image-renderer.ts     # Sharp-based image rendering
├── video-renderer.ts     # FFmpeg-based video rendering
└── layer-renderers/
    ├── index.ts          # Layer type dispatcher
    ├── gradient.ts       # Gradient layers
    ├── text.ts           # Text layers (SVG approach)
    ├── rectangle.ts      # Rectangle/line layers
    └── rating.ts         # Star rating layers
```

**Task breakdown:**

1. **types.ts** — Define interfaces
   - `Template`, `Layer`, `RenderContext`, `DesignResult`

2. **template-loader.ts**
   - `loadTemplate(campaign, channel): Template`
   - `getAllTemplates(): Template[]`
   - Cache templates in memory

3. **data-resolver.ts**
   - `resolveRenderData(assetId): RenderContext`
   - Fetch asset + submission + stylist with JOIN
   - Compute derived fields (display_name, client_first_name)
   - Determine applicable campaigns

4. **layer-renderers/**
   - Each returns a `Buffer` ready for Sharp composite
   - `renderGradient(layer, canvasWidth, canvasHeight): Buffer`
   - `renderText(layer, data, canvasWidth): Buffer`
   - `renderRectangle(layer): Buffer`
   - `renderRating(layer, data): Buffer`

5. **image-renderer.ts**
   - `renderImage(template, data, sourceBuffer): Buffer`
   - Orchestrates Sharp compositing

6. **video-renderer.ts**
   - `renderVideo(template, data, sourceVideoPath): string`
   - Shells out to FFmpeg
   - Returns path to rendered video

7. **index.ts** — Main orchestrator
   - `designAsset(assetId, stylistId): DesignResult`
   - Determines campaigns and channels
   - Loops through combinations
   - Saves to storage
   - Creates `designed_assets` records

### Phase 2: API Endpoint

**Modify:** `server/src/routes/assets.ts`

Add new endpoint:

```typescript
import { designAsset } from '../services/render-engine/index.js';

// POST /api/assets/:assetId/design
router.post('/assets/:assetId/design', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { assetId } = req.params;
    const stylistId = req.user!.id;

    // Verify asset belongs to stylist
    const [asset] = await db
      .select({ id: assets.id, stylistId: assets.stylistId })
      .from(assets)
      .where(eq(assets.id, assetId));

    if (!asset || asset.stylistId !== stylistId) {
      return res.status(404).json({ success: false, error: 'Asset not found' });
    }

    // Call render engine
    const result = await designAsset(assetId, stylistId);

    return res.json(result);
  } catch (error) {
    console.error('Design asset error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to design asset'
    });
  }
});
```

### Phase 3: Frontend Integration

**Modify Content Bank:**
1. Replace "Add to Designed Assets" button with "Design Asset"
2. Add loading state during rendering
3. Show success/error toast
4. Optionally redirect to Designed Assets page

**Designed Assets Page:**
1. Each card shows the designed image/video
2. "Publish" button on each card
3. Group by raw asset or campaign (TBD)

---

## 10. Dependencies

### 10.1 NPM Packages

```bash
# Already installed (verify)
npm list sharp

# Install if missing
npm install sharp
npm install @types/sharp --save-dev
```

### 10.2 System Dependencies

**FFmpeg** must be installed on the server for video rendering:

```bash
# Check if installed
ffmpeg -version

# Install on Ubuntu/Debian
apt-get install ffmpeg

# Install on macOS
brew install ffmpeg
```

### 10.3 Font Files

Download and place in `server/assets/fonts/`:

| Font | File | Usage |
|------|------|-------|
| Great Vibes | `GreatVibes-Regular.ttf` | Stylist/business names |
| Montserrat | `Montserrat-Regular.ttf` | Secondary text |
| Montserrat | `Montserrat-Medium.ttf` | CTA buttons |
| Montserrat | `Montserrat-SemiBold.ttf` | Labels |
| Playfair Display | `PlayfairDisplay-Regular.ttf` | Service type |
| Playfair Display | `PlayfairDisplay-Italic.ttf` | Review quotes |

**Download from Google Fonts:**
- https://fonts.google.com/specimen/Great+Vibes
- https://fonts.google.com/specimen/Montserrat
- https://fonts.google.com/specimen/Playfair+Display

---

## 11. Error Handling

| Error Case | Handling |
|------------|----------|
| Asset not found | Return 404 |
| Asset doesn't belong to stylist | Return 404 (security) |
| Missing stylist name | Use "Stylist" as fallback |
| Missing business name | Use stylist display_name |
| Missing city | Omit from template |
| Missing service_type | Use "Hair Service" fallback |
| Font file not found | Fall back to system sans-serif |
| FFmpeg not installed | Return 500 with clear error |
| Storage upload failed | Retry once, then mark as failed |
| Template file not found | Skip that combination, log error |

**Partial failure behavior:**
- If some templates succeed and others fail, return success with errors array
- All successful designs are saved to DB
- Failed designs have `status: 'failed'` and `error_message` set

---

## 12. Testing Checklist

### 12.1 Unit Tests

- [ ] Template loader finds all 15 templates
- [ ] Data resolver fetches and formats data correctly
- [ ] Campaign determination logic (social_proof requires rating + review)
- [ ] Channel determination logic (IMAGE vs VIDEO)
- [ ] Gradient layer renders correctly
- [ ] Text layer renders with correct font/size/color
- [ ] Rectangle layer renders
- [ ] Rating layer shows correct number of stars

### 12.2 Integration Tests

- [ ] Image asset with review generates 9 designs
- [ ] Image asset without review generates 6 designs
- [ ] Video asset with review generates 6 designs
- [ ] Video asset without review generates 4 designs
- [ ] Designed assets saved to storage
- [ ] designed_assets records created with correct fields
- [ ] Error handling for missing data

### 12.3 Visual Tests

- [ ] Cover fit + top anchor preserves faces
- [ ] Text is legible over gradients
- [ ] Fonts render correctly (not system fallback)
- [ ] Star ratings display 1-5 correctly
- [ ] Video overlays composite correctly

### 12.4 E2E Tests

- [ ] Click "Design Asset" → designs appear in Designed Assets page
- [ ] Publish button works (separate publishing logic)

---

## Appendix A: Existing Template Reference

Templates are located in `/server/templates/{campaign}/{channel}.json`.

The renderer in `/Template Builder/renderer_v3.html` can be used to visually test templates before server implementation.

---

## Appendix B: Database Queries

### Fetch Render Data

```sql
SELECT
  a.id AS asset_id,
  a.media_url,
  a.media_type,
  a.service_type,
  a.rating,
  a.review_text,
  s.client_name,
  st.first_name,
  st.last_name,
  st.business_name,
  st.city
FROM assets a
JOIN submissions s ON a.submission_id = s.id
JOIN stylists st ON a.stylist_id = st.id
WHERE a.id = $1 AND a.stylist_id = $2;
```

### Insert Designed Asset

```sql
INSERT INTO designed_assets (
  stylist_id,
  raw_asset_id,
  design_media_url,
  media_type,
  campaign,
  channel,
  status,
  template_id,
  metadata
) VALUES ($1, $2, $3, $4, $5, $6, 'generated', $7, $8)
RETURNING *;
```

---

*End of Document*
