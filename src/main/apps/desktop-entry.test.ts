import { describe, expect, it } from 'vitest';
import { execToArgv, parseDesktopEntry } from './desktop-entry';

describe('parseDesktopEntry', () => {
  it('reads the main group', () => {
    const entry = parseDesktopEntry(`
# comment
[Desktop Entry]
Type=Application
Name=Firefox
Name[de]=Firefox-Browser
GenericName=Web Browser
Keywords=internet;www;
Exec=firefox %u
Icon=firefox

[Desktop Action new-window]
Name=New Window
Exec=firefox --new-window
`);
    expect(entry).toEqual({
      name: 'Firefox',
      exec: 'firefox %u',
      icon: 'firefox',
      keywords: ['internet', 'www', 'Web Browser'],
      visible: true,
    });
  });

  it('marks hidden and non-application entries as not visible', () => {
    expect(parseDesktopEntry('[Desktop Entry]\nName=X\nExec=x\nNoDisplay=true')?.visible).toBe(false);
    expect(parseDesktopEntry('[Desktop Entry]\nName=X\nExec=x\nHidden=true')?.visible).toBe(false);
    expect(parseDesktopEntry('[Desktop Entry]\nName=X\nType=Link\nURL=https://x')?.visible).toBe(false);
    expect(parseDesktopEntry('[Desktop Entry]\nName=X')?.visible).toBe(false);
  });

  it('returns null without a desktop entry group or name', () => {
    expect(parseDesktopEntry('[Something Else]\nName=X')).toBeNull();
    expect(parseDesktopEntry('[Desktop Entry]\nExec=x')).toBeNull();
  });
});

describe('execToArgv', () => {
  it('drops field codes and splits arguments', () => {
    expect(execToArgv('firefox %u')).toEqual(['firefox']);
    expect(execToArgv('code --new-window %F')).toEqual(['code', '--new-window']);
  });

  it('handles quoting and escaped percent signs', () => {
    expect(execToArgv('"/opt/My App/app" --name="x y" 100%%')).toEqual(['/opt/My App/app', '--name=x y', '100%']);
    expect(execToArgv('sh -c "echo \\"hi\\""')).toEqual(['sh', '-c', 'echo "hi"']);
  });
});
