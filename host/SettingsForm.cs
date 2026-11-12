using System;
using System.Drawing;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Fief
{
    /// <summary>Fenêtre des réglages : une page web locale (theme/settings.html).</summary>
    sealed class SettingsForm : Form
    {
        readonly WebView2 view = new WebView2 { Dock = DockStyle.Fill };
        public event Action<string> Message;

        public SettingsForm(CoreWebView2Environment env, string themeDir, Icon icon)
        {
            Text = App.T("Fief · Réglages", "Fief · Settings");
            Icon = icon;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(1040, 700);
            MinimumSize = new Size(760, 520);
            BackColor = Color.FromArgb(24, 28, 34);
            Controls.Add(view);
            Init(env, themeDir);
        }

        async void Init(CoreWebView2Environment env, string themeDir)
        {
            try
            {
                await view.EnsureCoreWebView2Async(env);
                var core = view.CoreWebView2;
                core.Settings.AreDefaultContextMenusEnabled = false;
                core.Settings.IsStatusBarEnabled = false;
                core.Settings.IsZoomControlEnabled = false;
                core.Settings.AreDevToolsEnabled = false;
                core.SetVirtualHostNameToFolderMapping(App.VirtualHost, themeDir, CoreWebView2HostResourceAccessKind.Allow);
                try { await core.CallDevToolsProtocolMethodAsync("Network.setCacheDisabled", "{\"cacheDisabled\":true}"); } catch { }
                core.WebMessageReceived += (o, e) =>
                {
                    string m = null;
                    try { m = e.TryGetWebMessageAsString(); } catch { }
                    if (m != null && Message != null) Message(m);
                };
                core.Navigate("https://" + App.VirtualHost + "/settings.html?" + App.PageQuery());
            }
            catch (Exception ex) { Log.Write("Réglages : " + ex); }
        }

        /// <summary>Enregistre une image PNG de la page des réglages (contrôle).</summary>
        public async System.Threading.Tasks.Task SnapshotAsync(string path)
        {
            if (view.CoreWebView2 == null) return;
            using (var fs = System.IO.File.Create(path))
                await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, fs);
        }

        public void Post(string json)
        {
            try { if (view.CoreWebView2 != null) view.CoreWebView2.PostWebMessageAsJson(json); } catch { }
        }
    }
}
