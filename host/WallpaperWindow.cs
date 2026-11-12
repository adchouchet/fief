using System;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using static Fief.Native;

namespace Fief
{
    /// <summary>
    /// La fenêtre du fond d'écran : sans bordure, étendue à tous les écrans,
    /// glissée derrière les icônes du bureau, et remplie par une page web
    /// (WebView2) qui dessine le paysage.
    /// </summary>
    sealed class WallpaperWindow : Form
    {
        CoreWebView2Controller controller;
        public CoreWebView2 Core { get; private set; }
        /// <summary>Fenêtre de l'Explorateur à laquelle on est accroché.</summary>
        public IntPtr DesktopHost { get; private set; }
        /// <summary>Zone à couvrir, en coordonnées d'écran : tous les écrans, ou un seul.</summary>
        public Rectangle Target { get; set; }
        public event Action<string> Message;

        public WallpaperWindow()
        {
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.Manual;
            BackColor = Color.FromArgb(18, 74, 109);
            Text = "Fief";
            Bounds = SystemInformation.VirtualScreen;
            Target = SystemInformation.VirtualScreen;
        }

        /// <summary>Place la fenêtre sur sa zone cible ; le parent a pour origine le coin du bureau étendu.</summary>
        void Place(IntPtr after, uint flags)
        {
            var vs = SystemInformation.VirtualScreen;
            SetWindowPos(Handle, after, Target.X - vs.X, Target.Y - vs.Y, Math.Max(1, Target.Width), Math.Max(1, Target.Height), flags);
        }

        protected override bool ShowWithoutActivation { get { return true; } }

        protected override CreateParams CreateParams
        {
            get
            {
                var cp = base.CreateParams;
                cp.ExStyle |= (int)(WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE);
                return cp;
            }
        }

        /// <summary>Accroche la fenêtre derrière les icônes du bureau.</summary>
        public bool Attach()
        {
            IntPtr progman = FindWindow("Progman", null);
            if (progman == IntPtr.Zero) return false;

            // Message (non documenté mais utilisé par tous les fonds animés) qui demande
            // à l'Explorateur de créer la fenêtre « WorkerW » située derrière les icônes.
            IntPtr res;
            SendMessageTimeout(progman, 0x052C, (IntPtr)0xD, (IntPtr)1, SMTO_NORMAL, 1000, out res);

            IntPtr worker = IntPtr.Zero;
            EnumWindows((top, l) =>
            {
                if (FindWindowEx(top, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero)
                {
                    IntPtr w = FindWindowEx(IntPtr.Zero, top, "WorkerW", null);
                    if (w != IntPtr.Zero) worker = w;
                }
                return true;
            }, IntPtr.Zero);

            if (worker != IntPtr.Zero)
            {
                // Windows 10 et Windows 11 jusqu'à 23H2
                long style = GetWindowLongPtr(Handle, GWL_STYLE).ToInt64();
                SetWindowLongPtr(Handle, GWL_STYLE, (IntPtr)((style & ~WS_POPUP) | WS_CHILD));
                SetParent(Handle, worker);
                Place(IntPtr.Zero, SWP_NOACTIVATE | SWP_SHOWWINDOW);
                DesktopHost = worker;
                return true;
            }

            // Windows 11 24H2 et suivants : Progman contient lui-même les icônes
            // et la fenêtre du fond ; on se glisse juste sous les icônes.
            IntPtr defView = FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null);
            IntPtr inner = FindWindowEx(progman, IntPtr.Zero, "WorkerW", null);
            if (defView != IntPtr.Zero && inner != IntPtr.Zero)
            {
                long ex = GetWindowLongPtr(Handle, GWL_EXSTYLE).ToInt64();
                SetWindowLongPtr(Handle, GWL_EXSTYLE, (IntPtr)(ex | WS_EX_LAYERED));
                SetLayeredWindowAttributes(Handle, 0, 255, 2);
                long style = GetWindowLongPtr(Handle, GWL_STYLE).ToInt64();
                SetWindowLongPtr(Handle, GWL_STYLE, (IntPtr)((style & ~WS_POPUP) | WS_CHILD));
                SetParent(Handle, progman);
                Place(defView, SWP_NOACTIVATE | SWP_SHOWWINDOW);
                DesktopHost = progman;
                return true;
            }
            return false;
        }

        /// <summary>
        /// Repasse au-dessus des autres fonds animés accrochés au même endroit
        /// (Wallpaper Engine, Lively…), qui se remettent parfois devant.
        /// </summary>
        public void KeepOnTop()
        {
            if (DesktopHost == IntPtr.Zero || ClassName(DesktopHost) != "WorkerW") return;
            if (GetWindow(Handle, 3 /* GW_HWNDPREV */) != IntPtr.Zero)
                SetWindowPos(Handle, IntPtr.Zero /* HWND_TOP */, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        }

        /// <summary>Réajuste la fenêtre après un changement d'écrans ou de résolution.</summary>
        public void Refit()
        {
            Place(IntPtr.Zero, SWP_NOACTIVATE | SWP_NOZORDER);
            FitView();
        }

        void FitView()
        {
            if (controller == null) return;
            RECT r;
            GetWindowRect(Handle, out r);
            controller.Bounds = new Rectangle(0, 0, Math.Max(1, r.Right - r.Left), Math.Max(1, r.Bottom - r.Top));
        }

        public async Task InitAsync(CoreWebView2Environment env, string themeDir, bool devTools, bool debug)
        {
            controller = await env.CreateCoreWebView2ControllerAsync(Handle);
            controller.DefaultBackgroundColor = Color.FromArgb(18, 74, 109);
            // 1 pixel CSS = 1 pixel physique, quel que soit le facteur d'échelle de l'écran
            controller.ShouldDetectMonitorScaleChanges = false;
            controller.RasterizationScale = 1.0;
            FitView();
            controller.IsVisible = true;

            Core = controller.CoreWebView2;
            var s = Core.Settings;
            s.AreDefaultContextMenusEnabled = false;
            s.AreDevToolsEnabled = devTools;
            s.IsStatusBarEnabled = false;
            s.IsZoomControlEnabled = false;
            s.AreBrowserAcceleratorKeysEnabled = false;
            s.IsPinchZoomEnabled = false;
            s.IsSwipeNavigationEnabled = false;
            s.IsBuiltInErrorPageEnabled = false;

            Core.SetVirtualHostNameToFolderMapping(App.VirtualHost, themeDir, CoreWebView2HostResourceAccessKind.Allow);
            try { await Core.CallDevToolsProtocolMethodAsync("Network.setCacheDisabled", "{\"cacheDisabled\":true}"); } catch { }
            Core.WebMessageReceived += (o, e) =>
            {
                string m = null;
                try { m = e.TryGetWebMessageAsString(); } catch { }
                if (m != null && Message != null) Message(m);
            };
            Core.ProcessFailed += (o, e) =>
            {
                Log.Write("Processus WebView2 en échec : " + e.ProcessFailedKind);
                try { Core.Reload(); } catch { }
            };
            Core.Navigate("https://" + App.VirtualHost + "/index.html?" + App.PageQuery() + (debug ? "&debug=1" : ""));
            if (devTools) Core.OpenDevToolsWindow();
        }

        protected override void OnResize(EventArgs e)
        {
            base.OnResize(e);
            FitView();
        }

        public void Post(string json)
        {
            try { if (Core != null) Core.PostWebMessageAsJson(json); }
            catch (Exception ex) { Log.Write("Post : " + ex.Message); }
        }

        public void Reload()
        {
            try { if (Core != null) Core.Reload(); } catch { }
        }

        /// <summary>Enregistre une image PNG de ce que dessine la page (sans les icônes).</summary>
        public async Task SnapshotAsync(string path)
        {
            if (Core == null) return;
            using (var fs = File.Create(path))
                await Core.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, fs);
        }

        public void Shutdown()
        {
            try { if (controller != null) controller.Close(); } catch { }
            controller = null; Core = null;
            IntPtr host = DesktopHost;
            try { Close(); } catch { }
            // force l'Explorateur à repeindre le fond d'écran d'origine
            if (host != IntPtr.Zero) RedrawWindow(host, IntPtr.Zero, IntPtr.Zero, RDW_INVALIDATE | RDW_ERASE | RDW_ALLCHILDREN | RDW_UPDATENOW);
            SystemParametersInfo(SPI_SETDESKWALLPAPER, 0, null, 0);
        }
    }
}
