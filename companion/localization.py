"""Application-authored strings owned by the native Qt shell."""
from __future__ import annotations

MESSAGES = {
    "Show Companion": ("Mostrar Companion", "显示 Companion"),
    "Open Storyline popout": ("Abrir la ventana de historia", "打开剧情浮动窗口"),
    "Quit (stops alerts)": ("Salir (detiene los avisos)", "退出（停止提醒）"),
    "TEST · NOT A REAL REPORT": ("PRUEBA · AVISO SIMULADO", "测试 · 非真实报告"),
    "Open in Live": ("Abrir en En vivo", "在实时页面中打开"),
    "Display mode": ("Modo de vista", "显示模式"),
    "Compact": ("Compacto", "紧凑"),
    "Standard": ("Estándar", "标准"),
    "Expanded": ("Ampliado", "展开"),
    "Window opacity": ("Opacidad de la ventana", "窗口不透明度"),
    "Pin: keep above other windows": ("Fijar por encima de otras ventanas", "置顶：保持在其他窗口之上"),
    "Choose your ROM file (opened read-only)": ("Elige el archivo ROM (solo lectura)", "选择 ROM 文件（只读）"),
    "Choose folder": ("Elegir carpeta", "选择文件夹"),
    'Pin is not supported on native Wayland — relaunch with --xwayland': ('Wayland nativo no admite ventanas fijas. Inicia con --xwayland.', '原生 Wayland 不支持置顶。请使用 --xwayland 重新启动。'),
    'Reset this mode to its preset size': ('Restablecer el tamaño predefinido de este modo', '恢复此模式的预设尺寸'),
    'Keep my size when switching modes': ('Conservar el tamaño al cambiar de modo', '切换模式时保持窗口尺寸'),
    'Window opacity not supported here': ('La opacidad de la ventana no está disponible', '当前环境不支持窗口不透明度'),
    'Window': ('Ventana', '窗口'),
    'Lock position (prevents accidental dragging)': ('Bloquear la posición para evitar arrastres accidentales', '锁定位置，防止意外拖动'),
    'Minimise': ('Minimizar', '最小化'),
    'Close popout (data is kept)': ('Cerrar la ventana flotante (se conservan los datos)', '关闭浮动窗口（保留数据）'),
    'at an unknown time': ('a una hora desconocida', '时间未知'),
    'just now': ('ahora mismo', '刚刚'),
    '{count} min ago': ('hace {count} min', '{count} 分钟前'),
    '{count} h ago': ('hace {count} h', '{count} 小时前'),
    'Reported {time}': ('Hora del aviso: {time}', '报告时间：{time}'),
    'All files': ('Todos los archivos', '所有文件'),
}


def native_text(source: str, language: str) -> str:
    entry = MESSAGES.get(source)
    index = {"es": 0, "zh": 1}.get(language)
    return entry[index] if entry and index is not None else source
