using System;
using System.Collections.Generic;
using static Fief.Native;

namespace Fief
{
    /// <summary>
    /// Lit la position des icônes du bureau (uniquement leurs rectangles :
    /// ni les noms, ni le contenu des fichiers). Le bureau est une liste
    /// « SysListView32 » de l'Explorateur : on lui demande le rectangle de
    /// chaque élément via un petit tampon partagé.
    /// </summary>
    sealed class DesktopIcons : IDisposable
    {
        const uint LVM_GETITEMCOUNT = 0x1004, LVM_GETITEMRECT = 0x100E;
        const int LVIR_BOUNDS = 0;

        IntPtr listView, process, remote;

        public static IntPtr FindDefView()
        {
            IntPtr progman = FindWindow("Progman", null);
            IntPtr defView = FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null);
            if (defView != IntPtr.Zero) return defView;
            EnumWindows((top, l) =>
            {
                IntPtr v = FindWindowEx(top, IntPtr.Zero, "SHELLDLL_DefView", null);
                if (v != IntPtr.Zero) { defView = v; return false; }
                return true;
            }, IntPtr.Zero);
            return defView;
        }

        bool Open()
        {
            Close();
            IntPtr defView = FindDefView();
            if (defView == IntPtr.Zero) return false;
            listView = FindWindowEx(defView, IntPtr.Zero, "SysListView32", null);
            if (listView == IntPtr.Zero) return false;
            uint pid;
            GetWindowThreadProcessId(listView, out pid);
            process = OpenProcess(PROCESS_VM_OPERATION | PROCESS_VM_READ | PROCESS_VM_WRITE | PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
            if (process == IntPtr.Zero) { listView = IntPtr.Zero; return false; }
            remote = VirtualAllocEx(process, IntPtr.Zero, (IntPtr)64, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
            if (remote == IntPtr.Zero) { Close(); return false; }
            return true;
        }

        void Close()
        {
            if (process != IntPtr.Zero)
            {
                if (remote != IntPtr.Zero) VirtualFreeEx(process, remote, IntPtr.Zero, MEM_RELEASE);
                CloseHandle(process);
            }
            listView = process = remote = IntPtr.Zero;
        }

        /// <summary>
        /// Remplit <paramref name="into"/> avec les rectangles des icônes, exprimés
        /// dans le repère client de la fenêtre <paramref name="relativeTo"/>.
        /// Renvoie false si le bureau est introuvable (Explorateur en cours de redémarrage).
        /// </summary>
        public bool Read(IntPtr relativeTo, List<RECT> into)
        {
            into.Clear();
            if (listView == IntPtr.Zero || !IsWindow(listView)) { if (!Open()) return false; }
            if (!IsWindowVisible(listView)) return true; // icônes masquées : liste vide
            IntPtr res;
            if (SendMessageTimeout(listView, LVM_GETITEMCOUNT, IntPtr.Zero, IntPtr.Zero, SMTO_ABORTIFHUNG, 300, out res) == IntPtr.Zero) return false;
            int n = (int)res;
            if (n < 0 || n > 4000) return false;
            for (int i = 0; i < n; i++)
            {
                var r = new RECT { Left = LVIR_BOUNDS };
                IntPtr done;
                if (!WriteProcessMemory(process, remote, ref r, (IntPtr)16, out done)) { Close(); return false; }
                if (SendMessageTimeout(listView, LVM_GETITEMRECT, (IntPtr)i, remote, SMTO_ABORTIFHUNG, 300, out res) == IntPtr.Zero || res == IntPtr.Zero) continue;
                if (!ReadProcessMemory(process, remote, out r, (IntPtr)16, out done)) { Close(); return false; }
                var p = new POINT { X = r.Left, Y = r.Top };
                MapWindowPoints(listView, relativeTo, ref p, 1);
                into.Add(new RECT { Left = p.X, Top = p.Y, Right = p.X + (r.Right - r.Left), Bottom = p.Y + (r.Bottom - r.Top) });
            }
            return true;
        }

        public void Dispose() { Close(); }
    }
}
