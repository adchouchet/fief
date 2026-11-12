using System;
using System.Threading;
using System.Windows.Forms;

namespace Fief
{
    static class Program
    {
        public const string SignalSettings = @"Local\Fief.Wallpaper.OpenSettings";
        public const string SignalExit = @"Local\Fief.Wallpaper.Exit";
        const string MutexName = @"Local\Fief.Wallpaper.Instance";

        static Mutex instance;

        public static void ReleaseInstance()
        {
            try { if (instance != null) { instance.ReleaseMutex(); instance.Dispose(); instance = null; } } catch { }
        }

        [STAThread]
        static void Main(string[] args)
        {
            var opt = Options.Parse(args);

            bool created = false;
            // après un redémarrage de l'Explorateur, l'ancienne instance met un instant à s'effacer
            int tries = Array.IndexOf(args, "--wait") >= 0 ? 40 : 1;
            for (int i = 0; i < tries && !created; i++)
            {
                instance = new Mutex(true, MutexName, out created);
                if (!created) { instance.Dispose(); instance = null; if (tries > 1) Thread.Sleep(250); }
            }
            if (!created)
            {
                // déjà lancé : on demande à l'instance en place d'ouvrir ses réglages (ou de quitter)
                try
                {
                    using (var evt = EventWaitHandle.OpenExisting(opt.Exit ? SignalExit : SignalSettings)) evt.Set();
                }
                catch { }
                return;
            }
            if (opt.Exit) { ReleaseInstance(); return; }
            if (tries > 1) Thread.Sleep(2500); // laisse l'Explorateur reconstruire le bureau

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            Application.ThreadException += (s, e) => Log.Write("Exception : " + e.Exception);
            AppDomain.CurrentDomain.UnhandledException += (s, e) => Log.Write("Exception fatale : " + e.ExceptionObject);
            Application.Run(new HostContext(opt));
            ReleaseInstance();
        }
    }
}
