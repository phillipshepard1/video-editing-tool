# Chillin Render API Documentation

## Table of Contents
1. [Getting Started](#getting-started)
2. [API Endpoints](#api-endpoints)
3. [Project Data Structure](#project-data-structure)
4. [Video Elements](#video-elements)
5. [Response Codes](#response-codes)
6. [Examples](#examples)

---

## Getting Started

### Obtaining API Credentials
1. Visit the [Render Console](https://chillin.online/render-console)
2. Generate your Render API credentials
3. Store your API key securely

### Authentication
- Use Bearer token in Authorization header
- Format: `Authorization: Bearer YOUR_API_KEY`

---

## API Endpoints

### 1. Submit Render Request
**Endpoint:** `POST https://render-api.chillin.online/render/v1`

**Headers:**
```
Accept: application/json
Content-Type: application/json
Authorization: Bearer YOUR_API_KEY
```

**Request Body:**
```json
{
  "compositeWidth": 1920,
  "compositeHeight": 1080,
  "fps": 30,
  "projectData": { /* project data object */ }
}
```

**Response:**
```json
{
  "code": 0,
  "data": {
    "message": "Async render request submitted successfully",
    "render_id": 105586,
    "status": "processing"
  },
  "msg": "success"
}
```

### 2. Get Render Result
**Endpoint:** `POST https://render-api.chillin.online/render/result`

**Request Body:**
```json
{
  "render_id": 100000
}
```

**Response:**
```json
{
  "code": 0,
  "data": {
    "render": {
      "create_at": "2025-06-27T12:37:21.684337Z",
      "json_url": "https://cloud.chillin.online/project_xxx.json",
      "render_id": 105549,
      "state": "success",
      "video_url": "https://cloud.chillin.online/video_xxx.mp4"
    }
  },
  "msg": "success"
}
```

---

## Project Data Structure

### Root Parameters

| Property | Type | Required | Range/Values | Description |
|----------|------|----------|--------------|-------------|
| `compositeWidth` | number | Yes | 720-3840 | Width of the composite |
| `compositeHeight` | number | Yes | 720-3840 | Height of the composite |
| `fps` | number | Yes | 15-60 | Frame rate |
| `projectData` | object | Yes | - | Project configuration |

### ProjectData Object

| Property | Type | Required | Range/Values | Description |
|----------|------|----------|--------------|-------------|
| `type` | string | No | "video" \| "animation" | Project type (e.g., "video" or "animation") |
| `width` | number | Yes | 720-3840 | The width of the project canvas. Used as the base resolution for scaling |
| `height` | number | Yes | 720-3840 | The height of the project canvas. Used as the base resolution for scaling |
| `fill` | string/object | Yes | Hex or gradient | The background of the project canvas. Can be a hex color string or gradient object |
| `duration` | number | Yes | > 0 | The total duration of the project, in seconds |
| `view` | array | Yes | Non-empty | An array of elements representing the visual content in the project |
| `audio` | array | No | - | An array of audio tracks used in the project |
| `effect` | array | No | - | An array of visual effects applied to the canvas |
| `transition` | array | No | - | An array of transitions applied between different views |
| `version` | number | No | - | Project version |

**Important Notes:**
- The `view` array must contain at least one element
- The compositeWidth and compositeHeight can differ from the width and height in projectData
- The aspect ratio of compositeWidth to compositeHeight must remain consistent with projectData.width to projectData.height
- This design allows the same video project to be exported in different resolutions while maintaining the original aspect ratio

### Fill Gradient Object

| Property | Type | Required | Range/Values | Description |
|----------|------|----------|--------------|-------------|
| `type` | string | Yes | "linear" \| "radial" | The type of gradient |
| `colorStops` | array | Yes | - | Array of color stop objects defining colors and positions |
| `start` | object | Yes | - | Starting coordinate as {x, y} |
| `end` | object | Yes | - | Ending coordinate as {x, y} |

### Color Stop Object

| Property | Type | Required | Range/Values | Description |
|----------|------|----------|--------------|-------------|
| `color` | string | Yes | - | The color value at this stop, in hex format |
| `offset` | number | Yes | 0-1 | The position of this color stop along the gradient |

### Complete projectData.json Example
```json
{
    "type": "",
    "width": 1920,
    "height": 1080,
    "fill": "#000000",
    "view": [
      {
        "id": "8ecf7475-2c6c-47f9-827b-a09c7913f4c0",
        "type": "Image",
        "start": 0,
        "duration": 5,
        "trackIndex": 0,
        "x": -570.0335392757963,
        "y": -170.90659033307685,
        "blendMode": "normal",
        "anchorX": 1302,
        "anchorY": 2312,
        "rotation": 0,
        "scaleX": 0.23356401384083045,
        "scaleY": 0.23356401384083045,
        "alpha": 1,
        "skewX": 0,
        "skewY": 0,
        "keyframes": [],
        "externalUrl": "https://images.pexels.com/photos/30465303/pexels-photo-30465303.jpeg",
        "ext": "jpeg"
      }
    ],
    "audio": [],
    "effect": [],
    "transition": [],
    "version": 0,
    "duration": 5
}
```

---

## Video Elements

### Video Element Structure
```json
{
  // Basic Element Properties (all required)
  "id": "b895d96c-e974-4d3f-af6d-ddc464fd4997",  // Unique ID (UUID recommended)
  "type": "Video",
  "start": 0,              // Position in output timeline (seconds)
  "duration": 10,          // Duration in output (seconds)
  "trackIndex": 0,         // Track index in timeline
  
  // View Element Properties
  "x": 0,
  "y": 0,
  "width": 1920,           // Required for Video
  "height": 1080,          // Required for Video
  "blendMode": "normal",
  "anchorX": 960,          // Anchor point X
  "anchorY": 540,          // Anchor point Y
  "rotation": 0,
  "scaleX": 1,
  "scaleY": 1,
  "alpha": 1,              // Opacity (0-1)
  "skewX": 0,
  "skewY": 0,
  "keyframes": [],
  
  // Video-Specific Properties
  "externalUrl": "https://example.com/video.mp4",  // Must be accessible
  "ext": "mp4",            // "mp4" or "mov"
  "startInSource": 5,      // Start time in source video (seconds) - KEY FIELD FOR TRIMMING
  "volume": 1,             // 0-1 (optional, default 1)
  "hasAudio": true         // Required - indicates if video has audio
}
```

### Key Fields for Video Trimming
- `startInSource`: Start time in the source video (in seconds) - THIS IS THE CRITICAL FIELD
- `duration`: How long to play from that start point
- `start`: Position in the output timeline
- The end point in source is calculated as: `startInSource + duration`

---

## Response Codes

| Code | Description |
|------|-------------|
| 0 | Success |
| 2001 | Parameter error |
| 2002 | User not registered |
| 2003 | User is not an API member |
| 2004 | Invalid project data |
| 2005 | Render balance not enough |
| 2006 | Failed to marshal project data |
| 2007 | Failed to upload JSON data |
| 2008 | Failed to marshal render data |
| 2009 | Failed to send render request |
| 2010 | Missing duration field |
| 2011 | Invalid duration field |
| 2012 | Render service failed |

---

## Render States

| State | Description |
|-------|-------------|
| `pending` | Queued and waiting to be processed |
| `rendering` | Currently being processed |
| `success` | Completed successfully |
| `failed` | Failed due to an error |

---

## Examples

### Example 1: Simple Video Cut
Remove segments from a video, keeping only specific portions:

```json
{
  "compositeWidth": 1920,
  "compositeHeight": 1080,
  "fps": 30,
  "projectData": {
    "type": "video",
    "width": 1920,
    "height": 1080,
    "fill": "#000000",
    "duration": 20,
    "view": [
      {
        "id": "segment-1",
        "type": "Video",
        "start": 0,
        "duration": 10,
        "trackIndex": 0,
        "x": 0,
        "y": 0,
        "width": 1920,
        "height": 1080,
        "blendMode": "normal",
        "anchorX": 960,
        "anchorY": 540,
        "rotation": 0,
        "scaleX": 1,
        "scaleY": 1,
        "alpha": 1,
        "skewX": 0,
        "skewY": 0,
        "keyframes": [],
        "externalUrl": "https://example.com/source.mp4",
        "ext": "mp4",
        "sourceIn": 5,
        "sourceOut": 15
      },
      {
        "id": "segment-2",
        "type": "Video",
        "start": 10,
        "duration": 10,
        "trackIndex": 0,
        "x": 0,
        "y": 0,
        "width": 1920,
        "height": 1080,
        "blendMode": "normal",
        "anchorX": 960,
        "anchorY": 540,
        "rotation": 0,
        "scaleX": 1,
        "scaleY": 1,
        "alpha": 1,
        "skewX": 0,
        "skewY": 0,
        "keyframes": [],
        "externalUrl": "https://example.com/source.mp4",
        "ext": "mp4",
        "sourceIn": 25,
        "sourceOut": 35
      }
    ],
    "audio": [],
    "effect": [],
    "transition": [],
    "version": 0
  }
}
```

### Example 2: CURL Commands

**Submit Render:**
```bash
curl -X POST https://render-api.chillin.online/render/v1 \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d @request.json
```

**Check Status:**
```bash
curl -X POST https://render-api.chillin.online/render/result \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"render_id": 100000}'
```

---

## Notes

1. **Aspect Ratio:** The compositeWidth/compositeHeight can differ from projectData.width/height, but aspect ratios must match
2. **Async Processing:** All renders are processed asynchronously
3. **View Array:** Must contain at least one element
4. **Video Trimming:** Use sourceIn/sourceOut to specify which portions of source video to include

---

## Element Documentation

### Basic Element Properties
All elements in projectData arrays (view, audio, effect, transition) contain these common parameters:

| Property | Type | Required | Range/Values | Description |
|----------|------|----------|--------------|-------------|
| `id` | string | Yes | UUID recommended | A unique identifier for the element |
| `type` | string | Yes | See element types | Determines how the element is rendered |
| `start` | number | Yes | >= 0 | Time element appears on timeline (seconds) |
| `duration` | number | Yes | > 0 | Total duration in timeline (seconds) |
| `trackIndex` | number | Yes | >= 0 | Index of track in timeline |

**Element Types:**
Video, Image, Gif, Text, Caption, Shape, Chart, Progress, SoundWave, Group, Transition, Audio, Filter, Tone, Lut

---

### View Element Properties
Additional properties for visual elements in the view array:

| Property | Type | Required | Range/Values | Description |
|----------|------|----------|--------------|-------------|
| `x` | number | Yes | - | Horizontal position (pixels) |
| `y` | number | Yes | - | Vertical position (pixels) |
| `anchorX` | number | Yes | - | X-coordinate of anchor point (pixels) |
| `anchorY` | number | Yes | - | Y-coordinate of anchor point (pixels) |
| `rotation` | number | Yes | >= 0 | Rotation angle (degrees, clockwise) |
| `scaleX` | number | Yes | > 0 | Horizontal scaling factor |
| `scaleY` | number | Yes | > 0 | Vertical scaling factor |
| `alpha` | number | Yes | 0-1 | Opacity |
| `skewX` | number | No | >= 0 | Horizontal skew angle |
| `skewY` | number | No | >= 0 | Vertical skew angle |
| `blendMode` | string | No | See blend modes | Color composition method |
| `keyframes` | array | No | - | Animation states |

**Blend Modes:**
normal, multiply, screen, overlay, darken, lighten, color-dodge, color-burn, hard-light, soft-light, difference, exclusion

---

### Video Element Properties (extends View Element)

| Property | Type | Required | Range/Values | Description |
|----------|------|----------|--------------|-------------|
| `width` | number | Yes | - | Width of video element |
| `height` | number | Yes | - | Height of video element |
| `ext` | string | Yes | mp4 \| mov | File extension |
| `externalUrl` | string | No* | - | URL of video file (must be accessible) |
| `startInSource` | number | Yes | - | Start time in source file (seconds) |
| `volume` | number | No | 0-1 | Volume level (1=full, 0=muted) |
| `hasAudio` | boolean | Yes | - | Whether video contains audio |
| `tone` | object | No | - | Image tone adjustments |
| `lut` | object | No | - | Lookup table for tone adjustment |
| `filterAgent` | object | No | - | Filter applied to image |
| `maskData` | object | No | - | Mask data for cropping |

---

### Audio Element Properties

| Property | Type | Required | Range/Values | Description |
|----------|------|----------|--------------|-------------|
| `externalUrl` | string | No* | - | URL of audio file (must be accessible) |
| `ext` | string | Yes | mp3, wav, etc | File extension |
| `startInSource` | number | Yes | - | Start time in source file (seconds) |
| `volume` | number | Yes | 0-1 | Volume level (1=full, 0=muted) |

Example:
```json
{
  "id": "9bf3d1d3-a961-4457-9dd2-2def3109680a",
  "type": "Audio",
  "start": 0,
  "duration": 131.160813,
  "trackIndex": 0,
  "ext": "mp3",
  "startInSource": 0,
  "volume": 1
}
```

---

### Transition Element Properties

| Property | Type | Required | Range/Values | Description |
|----------|------|----------|--------------|-------------|
| `preNodeId` | string | Yes | - | ID of preceding element |
| `postNodeId` | string | Yes | - | ID of following element |
| `transitionType` | string | Yes | See types below | Type of transition effect |

**Transition Types:**
fade, directionalwarp, wipeDown, wipeUp, directionalwipe, Bounce, BowTieHorizontal, CircleCrop, ColourDistance, CrazyParametricFun, CrossZoom, Dreamy, DreamyZoom, FilmBurn, GlitchDisplace, GlitchMemories, Hexagonalize, kaleidoscope, Mosaic, perlin, pinwheel, pixelize, polarFunction, PolkaDotsCurtain, radial, randomNoisex, ripple, RotateScaleFade, rotateTransition, rotate_scale_vanish, SimpleZoom, squareswire, Swirl, WaterDrop, wind, windowblinds, windowslice, ZoomInCircles

Example:
```json
{
  "id": "52b20852-e260-41aa-afab-70c22e20f62b",
  "type": "Transition",
  "start": 8.218542,
  "duration": 2,
  "preNodeId": "435862f1-2358-464d-b379-26f4b63b12e3",
  "postNodeId": "2b82ffe3-7c6e-4d28-9c11-9e3de94c5a49",
  "transitionType": "directionalwarp",
  "trackIndex": null
}
```

---

### Keyframe Properties

| Property | Type | Required | Range/Values | Description |
|----------|------|----------|--------------|-------------|
| `id` | string | Yes | - | Unique identifier |
| `time` | number | Yes | - | Time of keyframe (seconds) |
| `stateObj` | object | Yes | - | Element state at keyframe |
| `cp1` | object | No | - | First control point |
| `cp2` | object | No | - | Second control point |

Keyframes enable precise animation by defining element states at specific moments and controlling interpolation between states.

---

## Support
For issues not covered in this documentation, contact: support@chillin.online