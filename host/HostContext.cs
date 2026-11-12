using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Win32;
using static Fief.Native;
using Timer = System.Windows.Forms.Timer;

namespace Fief
{
    sealed class Options
    {
        public bool AutoStart, Exit, DevTools, Debug;
        public string Snapshot, ScreenArg;
        public int SnapshotDelay = 6;

        public static Options Parse(string[] args)
        {
            var o = new Options();
            for (int i = 0; i < args.Length; i++)
            {
                switch (args[i].ToLowerInvariant())
                {
                    case "--autostart": o.AutoStart = true; break;
                    case "--exit": o.Exit = true; break;
                    case "--devtools": o.DevTools = true; break;
                    case "--debug": o.Debug = true; break;
                    case "--screen": if (i + 1 < args.Length) o.ScreenArg = args[++i].ToLowerInvariant(); break;
                    case "--snapshot":
                        if (i + 1 < args.Length) o.Snapshot = Path.GetFullPath(args[++i]);
                        int d;
                        if (i + 1 < args.Length && int.TryParse(args[i + 1], out d)) { o.SnapshotDelay = d; i++; }
                        break;
                }
            }
            return o;
        }
    }

    /// <summary>
    /// Chef d'orchestre : crée la fenêtre du fond d'écran, surveille les icônes,
    /// met en pause quand le bureau est caché, et gère l'icône de notification.
    /// </summary>
    sealed class HostContext : ApplicationContext
    {
        readonly Options opt;
        readonly string themeDir;
        readonly Control marshal = new Control();
        readonly DesktopIcons icons = new DesktopIcons();
        readonly List<RECT> rects = new List<RECT>();
        readonly Timer iconTimer = new Timer { Interval = 400 };
        readonly Timer pauseTimer = new Timer { Interval = 700 };
        readonly Icon appIcon = App.MakeIcon(32);

        CoreWebView2Environment env;
        WallpaperWindow wall;
        SettingsForm settings;
        NotifyIcon tray;
        ToolStripMenuItem pauseItem, autoItem, screenMenu;
        string lastIcons;
        string screenChoice = App.LoadScreen();
        bool pageReady, manualPause, locked, lastPaused, quitting;
        int missing;

        public HostContext(Options opt)
        {
            this.opt = opt;
            themeDir = App.FindThemeDir();
            if (opt.ScreenArg != null) ChooseFromOption(opt.ScreenArg);
            marshal.CreateControl();
            var h = marshal.Handle;
            BuildTray();
            ListenForSignals();
            SystemEvents.DisplaySettingsChanged += OnDisplayChanged;
            SystemEvents.SessionSwitch += OnSessionSwitch;
            iconTimer.Tick += (s, e) => PollIcons();
            pauseTimer.Tick += (s, e) => PollPause();
            Start();
        }

        async void Start()
        {
            try
            {
                if (themeDir == null) throw new FileNotFoundException(App.T("Dossier « theme » introuvable à côté de Fief.exe.", "The \"theme\" folder was not found next to Fief.exe."));
                Directory.CreateDirectory(App.DataDir);
                var envOpt = new CoreWebView2EnvironmentOptions(
                    "--disable-features=CalculateNativeWinOcclusion --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows");
                env = await CoreWebView2Environment.CreateAsync(null, Path.Combine(App.DataDir, "WebView2"), envOpt);

                wall = new WallpaperWindow();
                wall.Target = TargetBounds();
                wall.Message += OnWallMessage;
                var handle = wall.Handle; // crée la fenêtre sans l'afficher : elle n'apparaît qu'une fois derrière les icônes
                if (!wall.Attach()) throw new InvalidOperationException(App.T(
                    "Impossible de s'accrocher au bureau Windows. Si l'option « Animer les commandes et les éléments à l'intérieur des fenêtres » est désactivée dans les options de performances de Windows, réactivez-la puis relancez Fief.",
                    "Could not attach to the Windows desktop. If \"Animate controls and elements inside windows\" is turned off in Windows performance options, turn it back on and restart Fief."));
                wall.Show();
                wall.Refit();
                await wall.InitAsync(env, themeDir, opt.DevTools, opt.Debug);
                Log.Write("Démarré, version " + App.Version + ", échelle " + App.DisplayScale() + ", thème : " + themeDir);

                iconTimer.Start();
                pauseTimer.Start();

                bool firstRun = App.LoadSettings() == null;
                if (firstRun) App.SaveSettings("{}"); // l'accueil ne s'ouvre qu'une fois
                if (firstRun && !opt.AutoStart) OpenSettings();
                else if (!opt.AutoStart && opt.Snapshot == null)
                    tray.ShowBalloonTip(3000, "Fief", App.T("Le fond d'écran est actif. Clic droit sur cette icône pour les réglages.", "The wallpaper is running. Right-click this icon for settings."), ToolTipIcon.None);

                if (opt.Snapshot != null)
                {
                    var t = new Timer { Interval = Math.Max(1, opt.SnapshotDelay) * 1000 };
                    t.Tick += async (s, e) =>
                    {
                        t.Stop();
                        try
                        {
                            await wall.SnapshotAsync(opt.Snapshot);
                            if (settings != null && !settings.IsDisposed) await settings.SnapshotAsync(Path.ChangeExtension(opt.Snapshot, ".reglages.png"));
                            Log.Write("Capture : " + opt.Snapshot);
                        }
                        catch (Exception ex) { Log.Write("Capture impossible : " + ex.Message); }
                    };
                    t.Start();
                }
            }
            catch (Exception ex)
            {
                Log.Write("Échec du démarrage : " + ex);
                string hint = ex is WebView2RuntimeNotFoundException
                    ? App.T("Le composant Microsoft Edge WebView2 est introuvable. Installez « WebView2 Runtime » depuis le site de Microsoft, puis relancez Fief.",
                            "The Microsoft Edge WebView2 component was not found. Install \"WebView2 Runtime\" from Microsoft's website, then start Fief again.")
                    : ex.Message;
                MessageBox.Show(hint, "Fief", MessageBoxButtons.OK, MessageBoxIcon.Error);
                Quit();
            }
        }

        // ---------------------------------------------------------------- page du fond d'écran

        void OnWallMessage(string m)
        {
            if (m == "ready")
            {
                pageReady = true;
                lastIcons = null;
                string s = App.LoadSettings();
                wall.Post("{\"type\":\"init\",\"settings\":" + (s ?? "null") + "}");
                wall.Post("{\"type\":\"pause\",\"paused\":" + (lastPaused ? "true" : "false") + "}");
                PollIcons();
            }
            else if (m.StartsWith("log:")) Log.Write("page : " + m.Substring(4));
        }

        void PollIcons()
        {
            if (!pageReady || quitting || wall == null) return;
            if (!IsWindow(wall.Handle)) { Restart(); return; }
            if (!icons.Read(wall.Handle, rects))
            {
                // bureau introuvable plusieurs fois de suite : l'Explorateur a redémarré
                if (++missing > 12) Restart();
                return;
            }
            missing = 0;
            // sur un seul écran, seules les icônes de cet écran comptent
            if (screenChoice != "all")
            {
                int w = wall.Target.Width, hgt = wall.Target.Height;
                rects.RemoveAll(q => q.Right <= 0 || q.Bottom <= 0 || q.Left >= w || q.Top >= hgt);
            }
            var sb = new StringBuilder("[");
            for (int i = 0; i < rects.Count; i++)
            {
                var r = rects[i];
                if (i > 0) sb.Append(',');
                sb.Append('[').Append(r.Left).Append(',').Append(r.Top).Append(',').Append(r.Right - r.Left).Append(',').Append(r.Bottom - r.Top).Append(']');
            }
            sb.Append(']');
            string json = sb.ToString();
            if (json == lastIcons) return;
            if (lastIcons == null)
                Log.Write(rects.Count + " icônes sur la zone couverte (" + wall.Target.Width + "x" + wall.Target.Height + ")");
            lastIcons = json;
            wall.Post("{\"type\":\"icons\",\"rects\":" + json + "}");
        }

        // ---------------------------------------------------------------- pause automatique

        /// <summary>Vrai si chaque écran couvert par Fief est caché par une fenêtre agrandie ou en plein écran.</summary>
        bool AllScreensCovered()
        {
            var target = wall.Target;
            var screens = Array.FindAll(Screen.AllScreens, sc => sc.Bounds.IntersectsWith(target));
            if (screens.Length == 0) return false;
            var covered = new bool[screens.Length];
            IntPtr self = wall != null ? wall.Handle : IntPtr.Zero;
            IntPtr mine = settings != null && !settings.IsDisposed ? settings.Handle : IntPtr.Zero;
            EnumWindows((h, l) =>
            {
                if (h == self || h == mine || !IsWindowVisible(h) || IsIconic(h)) return true;
                int cloaked;
                if (DwmGetWindowAttribute(h, DWMWA_CLOAKED, out cloaked, 4) == 0 && cloaked != 0) return true;
                long ex = GetWindowLongPtr(h, GWL_EXSTYLE).ToInt64();
                if ((ex & (WS_EX_TOOLWINDOW | WS_EX_TRANSPARENT | WS_EX_NOACTIVATE)) != 0) return true;
                string cls = ClassName(h);
                if (cls == "Progman" || cls == "WorkerW" || cls == "Shell_TrayWnd" || cls == "Shell_SecondaryTrayWnd") return true;
                RECT r;
                if (!GetWindowRect(h, out r)) return true;
                for (int i = 0; i < screens.Length; i++)
                {
                    var wa = screens[i].WorkingArea;
                    if (r.Left <= wa.Left + 2 && r.Top <= wa.Top + 2 && r.Right >= wa.Right - 2 && r.Bottom >= wa.Bottom - 2) covered[i] = true;
                }
                return true;
            }, IntPtr.Zero);
            foreach (bool c in covered) if (!c) return false;
            return true;
        }

        void PollPause()
        {
            if (!pageReady || quitting || wall == null) return;
            wall.KeepOnTop();
            bool paused = manualPause || locked || AllScreensCovered();
            if (paused == lastPaused) return;
            lastPaused = paused;
            if (opt.Debug) Log.Write(paused ? "Pause (bureau entièrement couvert)" : "Reprise");
            wall.Post("{\"type\":\"pause\",\"paused\":" + (paused ? "true" : "false") + "}");
        }

        void OnSessionSwitch(object s, SessionSwitchEventArgs e)
        {
            if (e.Reason == SessionSwitchReason.SessionLock) locked = true;
            else if (e.Reason == SessionSwitchReason.SessionUnlock) locked = false;
        }

        void OnDisplayChanged(object s, EventArgs e)
        {
            if (wall == null || quitting) return;
            marshal.BeginInvoke((Action)(() => { try { wall.Target = TargetBounds(); wall.Refit(); lastIcons = null; } catch { } }));
        }

        // ---------------------------------------------------------------- choix de l'écran

        /// <summary>Écrans rangés de gauche à droite (puis de haut en bas).</summary>
        static Screen[] SortedScreens()
        {
            var a = Screen.AllScreens;
            Array.Sort(a, (p, q) => p.Bounds.X != q.Bounds.X ? p.Bounds.X.CompareTo(q.Bounds.X) : p.Bounds.Y.CompareTo(q.Bounds.Y));
            return a;
        }

        /// <summary>0 = tous les écrans, k = k-ième écran en partant de la gauche.</summary>
        int ScreenIndex()
        {
            var a = SortedScreens();
            for (int i = 0; i < a.Length; i++) if (a[i].DeviceName == screenChoice) return i + 1;
            return 0;
        }

        Rectangle TargetBounds()
        {
            int i = ScreenIndex();
            return i == 0 ? SystemInformation.VirtualScreen : SortedScreens()[i - 1].Bounds;
        }

        static string ScreenLabel(Screen[] a, int i, bool shortForm)
        {
            bool sideBySide = a.Length == 2 && a[0].Bounds.X != a[1].Bounds.X;
            string name;
            if (sideBySide) name = i == 0
                ? (shortForm ? App.T("Gauche", "Left") : App.T("Écran de gauche", "Left screen"))
                : (shortForm ? App.T("Droite", "Right") : App.T("Écran de droite", "Right screen"));
            else name = App.T("Écran ", "Screen ") + (i + 1);
            if (shortForm) return name;
            return name + " · " + a[i].Bounds.Width + "×" + a[i].Bounds.Height + (a[i].Primary ? App.T(" (principal)", " (main)") : "");
        }

        void SetScreen(int index)
        {
            var a = SortedScreens();
            screenChoice = index >= 1 && index <= a.Length ? a[index - 1].DeviceName : "all";
            App.SaveScreen(screenChoice);
            if (wall != null && !quitting)
            {
                wall.Target = TargetBounds();
                wall.Refit();
                lastIcons = null;
                PollIcons();
                PollPause();
            }
            if (settings != null && !settings.IsDisposed) settings.Post("{\"type\":\"screen\",\"index\":" + ScreenIndex() + "}");
        }

        /// <summary>Option --screen : tous | gauche | droite | numéro (de gauche à droite).</summary>
        void ChooseFromOption(string v)
        {
            var a = SortedScreens();
            int n;
            if (v == "tous" || v == "all") screenChoice = "all";
            else if (v == "gauche" || v == "left") screenChoice = a[0].DeviceName;
            else if (v == "droite" || v == "right") screenChoice = a[a.Length - 1].DeviceName;
            else if (int.TryParse(v, out n) && n >= 1 && n <= a.Length) screenChoice = a[n - 1].DeviceName;
            else return;
            App.SaveScreen(screenChoice);
        }

        string ScreensJson()
        {
            var a = SortedScreens();
            var sb = new StringBuilder("[{\"s\":\"" + App.T("Tous", "All") + "\",\"l\":\"" + App.T("Tous les écrans, d'un seul tenant", "All screens, as one continuous world") + "\"}");
            for (int i = 0; i < a.Length; i++)
                sb.Append(",{\"s\":\"").Append(ScreenLabel(a, i, true)).Append("\",\"l\":\"").Append(ScreenLabel(a, i, false)).Append("\"}");
            return sb.Append(']').ToString();
        }

        // ---------------------------------------------------------------- réglages

        void OpenSettings()
        {
            if (env == null) return;
            if (settings == null || settings.IsDisposed)
            {
                settings = new SettingsForm(env, themeDir, appIcon);
                settings.Message += OnSettingsMessage;
            }
            settings.Show();
            if (settings.WindowState == FormWindowState.Minimized) settings.WindowState = FormWindowState.Normal;
            settings.Activate();
        }

        void OnSettingsMessage(string m)
        {
            if (m == "ready")
            {
                string s = App.LoadSettings();
                settings.Post("{\"type\":\"init\",\"settings\":" + (s ?? "null") + ",\"autostart\":" + (App.AutoStart ? "true" : "false")
                    + ",\"version\":\"" + App.Version + "\",\"screens\":" + ScreensJson() + ",\"screen\":" + ScreenIndex() + "}");
            }
            else if (m.StartsWith("save:"))
            {
                string json = m.Substring(5).Trim();
                if (!json.StartsWith("{") || !json.EndsWith("}")) return;
                App.SaveSettings(json);
                if (wall != null) wall.Post("{\"type\":\"settings\",\"data\":" + json + "}");
            }
            else if (m == "autostart:1") { App.AutoStart = true; SyncMenu(); }
            else if (m == "autostart:0") { App.AutoStart = false; SyncMenu(); }
            else if (m == "reload") { if (wall != null) { pageReady = false; wall.Reload(); } }
            else if (m.StartsWith("screen:")) { int n; if (int.TryParse(m.Substring(7), out n)) SetScreen(n); }
        }

        // ---------------------------------------------------------------- icône de notification

        void BuildTray()
        {
            var menu = new ContextMenuStrip();
            var open = new ToolStripMenuItem(App.T("Réglages…", "Settings…"), null, (s, e) => OpenSettings());
            open.Font = new Font(open.Font, FontStyle.Bold);
            pauseItem = new ToolStripMenuItem(App.T("Mettre en pause", "Pause"), null, (s, e) => { manualPause = !manualPause; SyncMenu(); PollPause(); });
            var reload = new ToolStripMenuItem(App.T("Recharger le monde", "Reload the world"), null, (s, e) => { if (wall != null) { pageReady = false; wall.Reload(); } });
            autoItem = new ToolStripMenuItem(App.T("Lancer au démarrage de Windows", "Start with Windows"), null, (s, e) => { App.AutoStart = !App.AutoStart; SyncMenu(); });
            var quit = new ToolStripMenuItem(App.T("Quitter", "Quit"), null, (s, e) => Quit());
            screenMenu = new ToolStripMenuItem(App.T("Écrans", "Screens"));
            menu.Items.AddRange(new ToolStripItem[] { open, screenMenu, pauseItem, reload, autoItem, new ToolStripSeparator(), quit });
            menu.Opening += (s, e) => SyncMenu();
            tray = new NotifyIcon { Icon = appIcon, Text = App.T("Fief · fond d'écran médiéval", "Fief · medieval wallpaper"), ContextMenuStrip = menu, Visible = true };
            tray.DoubleClick += (s, e) => OpenSettings();
        }

        void SyncMenu()
        {
            pauseItem.Text = manualPause ? App.T("Reprendre", "Resume") : App.T("Mettre en pause", "Pause");
            autoItem.Checked = App.AutoStart;
            // la liste des écrans est refaite à chaque ouverture : ils peuvent avoir changé
            var a = SortedScreens();
            int current = ScreenIndex();
            screenMenu.DropDownItems.Clear();
            screenMenu.Visible = a.Length > 1;
            screenMenu.DropDownItems.Add(new ToolStripMenuItem(App.T("Tous les écrans", "All screens"), null, (s, e) => SetScreen(0)) { Checked = current == 0 });
            for (int i = 0; i < a.Length; i++)
            {
                int index = i + 1;
                screenMenu.DropDownItems.Add(new ToolStripMenuItem(ScreenLabel(a, i, false), null, (s, e) => SetScreen(index)) { Checked = current == index });
            }
        }

        // ---------------------------------------------------------------- instance unique, arrêt

        void ListenForSignals()
        {
            var openEvt = new EventWaitHandle(false, EventResetMode.AutoReset, Program.SignalSettings);
            var exitEvt = new EventWaitHandle(false, EventResetMode.AutoReset, Program.SignalExit);
            var t = new Thread(() =>
            {
                for (;;)
                {
                    int i = WaitHandle.WaitAny(new WaitHandle[] { openEvt, exitEvt });
                    try
                    {
                        if (i == 0) marshal.BeginInvoke((Action)OpenSettings);
                        else { marshal.BeginInvoke((Action)Quit); return; }
                    }
                    catch { return; }
                }
            });
            t.IsBackground = true;
            t.Start();
        }

        /// <summary>L'Explorateur a redémarré : notre fenêtre a disparu avec lui, on relance tout.</summary>
        void Restart()
        {
            if (quitting) return;
            Log.Write("Bureau perdu, redémarrage.");
            quitting = true;
            Cleanup(false);
            try { Process.Start(new ProcessStartInfo(App.ExePath, "--autostart --wait") { UseShellExecute = false }); } catch { }
            ExitThread();
        }

        void Quit()
        {
            if (quitting) return;
            quitting = true;
            Cleanup(true);
            ExitThread();
        }

        void Cleanup(bool restoreDesktop)
        {
            iconTimer.Stop(); pauseTimer.Stop();
            SystemEvents.DisplaySettingsChanged -= OnDisplayChanged;
            SystemEvents.SessionSwitch -= OnSessionSwitch;
            try { if (settings != null && !settings.IsDisposed) settings.Close(); } catch { }
            try { if (wall != null && restoreDesktop) wall.Shutdown(); } catch { }
            icons.Dispose();
            if (tray != null) { tray.Visible = false; tray.Dispose(); }
            Program.ReleaseInstance();
        }
    }
}
