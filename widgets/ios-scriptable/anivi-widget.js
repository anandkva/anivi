// Anivi ❤️ — iOS Home Screen widget (Scriptable)
//
// iOS gives no way for a website or PWA to install a Home Screen widget: only
// a native WidgetKit extension can. Scriptable is a free App Store app that
// hosts WidgetKit widgets driven by a script, so this file is a genuine iOS
// widget — small and medium — talking to the same Anivi backend as the web app.
//
// Setup
//   1. Install Scriptable from the App Store.
//   2. Add a new script called "Anivi" and paste this file in.
//   3. Long-press the Home Screen → + → Scriptable → pick Small or Medium.
//   4. Edit the widget: Script = Anivi, "When Interacting" = Run Script,
//      Parameter = roomId|apiBase|appUrl
//      e.g. room_ab12cd34|https://api.anivi.app|https://anivi.app
//
// The room id is shown in Anivi under Settings. The widget never holds a
// connection open — it reads the snapshot the app last published, which is
// exactly what the OS allows a widget to do.

const DEFAULTS = {
  roomId: '',
  apiBase: '',
  appUrl: '',
  userId: 'widget',
};

// Refresh cadence hint. iOS decides the real schedule; asking for ~15 minutes
// is the practical floor for a widget that is not push-driven.
const REFRESH_MINUTES = 15;

const PINK = new Color('#e8386c');
const INK = new Color('#2b2440');
const SOFT = new Color('#8d8199');

const config_ = parseParameter(args.widgetParameter);
const widget = await buildWidget(config_);

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  // Running the script inside Scriptable previews the medium layout.
  await widget.presentMedium();
}
Script.complete();

function parseParameter(param) {
  const [roomId, apiBase, appUrl, userId] = String(param ?? '')
    .split('|')
    .map((s) => (s ?? '').trim());
  return {
    roomId: roomId || DEFAULTS.roomId,
    apiBase: stripSlash(apiBase || DEFAULTS.apiBase),
    appUrl: appUrl || DEFAULTS.appUrl,
    userId: userId || DEFAULTS.userId,
  };
}

function stripSlash(url) {
  return url.replace(/\/+$/, '');
}

async function buildWidget(cfg) {
  const w = new ListWidget();
  w.setPadding(14, 16, 14, 16);
  const bg = new LinearGradient();
  bg.colors = [new Color('#fff5f8'), new Color('#ffe2ec')];
  bg.locations = [0, 1];
  w.backgroundGradient = bg;
  w.refreshAfterDate = new Date(Date.now() + REFRESH_MINUTES * 60 * 1000);

  if (cfg.roomId && cfg.appUrl) {
    // Tapping the widget opens Anivi straight into the shared space.
    w.url = `${cfg.appUrl}/?room=${encodeURIComponent(cfg.roomId)}`;
  } else if (cfg.appUrl) {
    w.url = cfg.appUrl;
  }

  if (!cfg.roomId || !cfg.apiBase) {
    title(w, '❤️ Anivi');
    w.addSpacer(6);
    body(w, 'Set the widget parameter to roomId|apiBase|appUrl', 12, SOFT);
    return w;
  }

  const state = await loadState(cfg);
  if (!state) {
    title(w, '❤️ Anivi');
    w.addSpacer(6);
    body(w, "Can't reach your space", 14, SOFT);
    return w;
  }

  const family = config.widgetFamily ?? 'medium';
  const activity =
    state.lastActivityKind === 'miss_you' ? '❤️ They miss you' : state.lastActivity ?? 'Anivi';
  const when = relativeTime(state.lastActivityTimestamp);

  // Header
  const header = w.addStack();
  header.centerAlignContent();
  const brand = header.addText('❤️ Anivi');
  brand.font = Font.boldRoundedSystemFont(family === 'small' ? 13 : 15);
  brand.textColor = PINK;
  header.addSpacer();
  if (state.online > 1) {
    const live = header.addText('🟢');
    live.font = Font.systemFont(11);
  }

  w.addSpacer(family === 'small' ? 6 : 8);

  if (family === 'small') {
    // Small: the activity line is the whole story.
    const heart = w.addText(state.lastActivityKind === 'miss_you' ? '❤️' : '✏️');
    heart.font = Font.systemFont(30);
    w.addSpacer(4);
    body(w, activity, 14, INK, 3);
    w.addSpacer();
    body(w, when, 11, SOFT);
    return w;
  }

  // Medium and large: show the shared drawing.
  const image = await loadPreview(cfg, state);
  if (image) {
    const img = w.addImage(image);
    img.cornerRadius = 12;
    img.imageSize = new Size(family === 'large' ? 300 : 290, family === 'large' ? 220 : 92);
    img.applyFillingContentMode();
  } else {
    body(w, 'Draw together ❤️', 14, SOFT);
  }

  w.addSpacer(8);
  const footer = w.addStack();
  footer.centerAlignContent();
  const line = footer.addText(activity);
  line.font = Font.boldRoundedSystemFont(15);
  line.textColor = INK;
  line.lineLimit = 1;
  footer.addSpacer();
  const time = footer.addText(when);
  time.font = Font.systemFont(11);
  time.textColor = SOFT;

  return w;
}

async function loadState(cfg) {
  try {
    const req = new Request(`${cfg.apiBase}/api/room/${encodeURIComponent(cfg.roomId)}`);
    req.timeoutInterval = 8;
    return await req.loadJSON();
  } catch (err) {
    console.error(`anivi: state request failed: ${err}`);
    return null;
  }
}

async function loadPreview(cfg, state) {
  if (!state.hasPreview) return null;
  try {
    const req = new Request(
      `${cfg.apiBase}/api/room/${encodeURIComponent(cfg.roomId)}/preview?v=${state.previewUpdatedAt}`,
    );
    req.timeoutInterval = 8;
    return await req.loadImage();
  } catch (err) {
    console.error(`anivi: preview request failed: ${err}`);
    return null;
  }
}

function title(w, text) {
  const t = w.addText(text);
  t.font = Font.boldRoundedSystemFont(16);
  t.textColor = PINK;
}

function body(w, text, size, color, lineLimit = 0) {
  const t = w.addText(text);
  t.font = Font.roundedSystemFont(size);
  t.textColor = color;
  if (lineLimit) t.lineLimit = lineLimit;
  return t;
}

function relativeTime(ts) {
  if (!ts) return '';
  const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}
