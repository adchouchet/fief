using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Reflection;
using System.Text;
using Microsoft.Win32;

namespace Fief
{
    /// <summary>Constantes et petits services partagés : dossiers, journal, réglages, démarrage automatique.</summary>
    static class App
    {
        public const string Name = "Fief";
        public const string VirtualHost = "fief.local";

        public static readonly string DataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), Name);
        public static readonly string SettingsFile = Path.Combine(DataDir, "settings.json");
        public static readonly string ExePath = Assembly.GetExecutingAssembly().Location;
        public static readonly string Version = Assembly.GetExecutingAssembly().GetName().Version.ToString(3);

        /// <summary>Vrai si Windows est en français ; sinon l'interface est en anglais.</summary>
        public static readonly bool French = System.Globalization.CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "fr";

        /// <summary>Choisit le texte selon la langue de Windows.</summary>
        public static string T(string fr, string en) { return French ? fr : en; }

        /// <summary>Échelle d'affichage de Windows : 1 pour 100 %, 1,5 pour 150 %…</summary>
        public static double DisplayScale()
        {
            try { uint dpi = Native.GetDpiForSystem(); if (dpi >= 96 && dpi <= 960) return dpi / 96.0; }
            catch { }
            return 1.0;
        }

        /// <summary>Paramètres communs passés aux pages : langue et échelle.</summary>
        public static string PageQuery()
        {
            return "host=1&lang=" + (French ? "fr" : "en") + "&scale=" + DisplayScale().ToString("0.###", System.Globalization.CultureInfo.InvariantCulture);
        }

        /// <summary>Dossier du thème : à côté de l'exécutable, sinon dans un dossier parent (mode développement).</summary>
        public static string FindThemeDir()
        {
            var dir = new DirectoryInfo(Path.GetDirectoryName(ExePath));
            for (int i = 0; i < 6 && dir != null; i++, dir = dir.Parent)
            {
                string candidate = Path.Combine(dir.FullName, "theme");
                if (File.Exists(Path.Combine(candidate, "index.html"))) return candidate;
            }
            return null;
        }

        // ---------------------------------------------------------------- réglages

        /// <summary>Renvoie le JSON des réglages, ou null s'il n'y en a pas encore.</summary>
        public static string LoadSettings()
        {
            try
            {
                if (!File.Exists(SettingsFile)) return null;
                string s = File.ReadAllText(SettingsFile, Encoding.UTF8).Trim();
                return s.StartsWith("{") && s.EndsWith("}") ? s : null;
            }
            catch { return null; }
        }

        public static void SaveSettings(string json)
        {
            try
            {
                Directory.CreateDirectory(DataDir);
                File.WriteAllText(SettingsFile, json, new UTF8Encoding(false));
            }
            catch (Exception ex) { Log.Write("Réglages non enregistrés : " + ex.Message); }
        }

        // ---------------------------------------------------------------- écran choisi

        static readonly string ScreenFile = Path.Combine(DataDir, "screen.txt");

        /// <summary>« all », ou le nom Windows de l'écran choisi (du type DISPLAY2).</summary>
        public static string LoadScreen()
        {
            try
            {
                if (File.Exists(ScreenFile)) { string s = File.ReadAllText(ScreenFile).Trim(); if (s.Length > 0) return s; }
            }
            catch { }
            return "all";
        }

        public static void SaveScreen(string choice)
        {
            try { Directory.CreateDirectory(DataDir); File.WriteAllText(ScreenFile, choice); }
            catch (Exception ex) { Log.Write("Écran non enregistré : " + ex.Message); }
        }

        // ---------------------------------------------------------------- démarrage avec Windows

        const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";

        public static bool AutoStart
        {
            get
            {
                try
                {
                    using (var k = Registry.CurrentUser.OpenSubKey(RunKey))
                    {
                        var v = k == null ? null : k.GetValue(Name) as string;
                        return v != null && v.IndexOf(ExePath, StringComparison.OrdinalIgnoreCase) >= 0;
                    }
                }
                catch { return false; }
            }
            set
            {
                try
                {
                    using (var k = Registry.CurrentUser.OpenSubKey(RunKey, true))
                    {
                        if (k == null) return;
                        if (value) k.SetValue(Name, "\"" + ExePath + "\" --autostart");
                        else k.DeleteValue(Name, false);
                    }
                }
                catch (Exception ex) { Log.Write("Démarrage automatique : " + ex.Message); }
            }
        }

        // ---------------------------------------------------------------- icône

        /// <summary>Dessine l'icône de l'application : une tour crénelée sur un écu bleu.</summary>
        public static Icon MakeIcon(int size)
        {
            using (var bmp = new Bitmap(size, size))
            {
                using (var g = Graphics.FromImage(bmp))
                {
                    g.SmoothingMode = SmoothingMode.AntiAlias;
                    float u = size / 32f;
                    using (var shield = new GraphicsPath())
                    {
                        shield.AddLine(3 * u, 3 * u, 29 * u, 3 * u);
                        shield.AddLine(29 * u, 3 * u, 29 * u, 15 * u);
                        shield.AddBezier(29 * u, 15 * u, 29 * u, 24 * u, 20 * u, 28 * u, 16 * u, 30 * u);
                        shield.AddBezier(16 * u, 30 * u, 12 * u, 28 * u, 3 * u, 24 * u, 3 * u, 15 * u);
                        shield.CloseFigure();
                        using (var b = new SolidBrush(Color.FromArgb(47, 95, 196))) g.FillPath(b, shield);
                        using (var p = new Pen(Color.FromArgb(24, 48, 110), 1.6f * u)) g.DrawPath(p, shield);
                    }
                    using (var stone = new SolidBrush(Color.FromArgb(236, 230, 214)))
                    {
                        g.FillRectangle(stone, 11 * u, 12 * u, 10 * u, 12 * u);
                        g.FillRectangle(stone, 9.5f * u, 8 * u, 3 * u, 5 * u);
                        g.FillRectangle(stone, 14.5f * u, 8 * u, 3 * u, 5 * u);
                        g.FillRectangle(stone, 19.5f * u, 8 * u, 3 * u, 5 * u);
                    }
                    using (var door = new SolidBrush(Color.FromArgb(60, 42, 26)))
                        g.FillRectangle(door, 14.2f * u, 18 * u, 3.6f * u, 6 * u);
                }
                IntPtr h = bmp.GetHicon();
                try { return (Icon)Icon.FromHandle(h).Clone(); }
                finally { Native.DestroyIcon(h); }
            }
        }
    }

    static class Log
    {
        static readonly object gate = new object();
        static readonly string FilePath = Path.Combine(App.DataDir, "host.log");

        public static void Write(string msg)
        {
            try
            {
                lock (gate)
                {
                    Directory.CreateDirectory(App.DataDir);
                    var fi = new FileInfo(FilePath);
                    if (fi.Exists && fi.Length > 300000) fi.Delete();
                    File.AppendAllText(FilePath, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + msg + Environment.NewLine, Encoding.UTF8);
                }
            }
            catch { }
        }
    }
}
