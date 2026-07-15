import Phaser from 'phaser';
import { api, initConfig, loadArena, saveArena, probeArena } from '../api';
import { saveSession } from '../session';
import { button, toast, pageFrame, FONT } from './ui';

export class LoginScene extends Phaser.Scene {
  constructor() { super('Login'); }

  create(): void {
    pageFrame(this);
    // full-width center: the login screen has no chat panel
    this.add.text(this.scale.width / 2, 48, 'PIXEL RUSH', {
      fontFamily: FONT, fontSize: '36px', color: '#ffd60a', stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5);
    this.add.text(this.scale.width / 2, 92, 'GameLift Multiplayer Racing Workshop', {
      fontFamily: FONT, fontSize: '15px', color: '#adb5bd',
    }).setOrigin(0.5);

    const arena = loadArena();
    const isCustom = arena.kind === 'custom';
    const form = this.add.dom(this.scale.width / 2, 290).createFromHTML(`
      <div style="display: flex; flex-direction: column; gap: 10px; align-items: center; font-family: monospace;">
        <div id="arena-toggle" style="display: flex; gap: 0; border: 2px solid #4a4e69; border-radius: 4px; overflow: hidden;">
          <div id="arena-aws" style="padding: 8px 22px; cursor: pointer; font-size: 13px; user-select: none;
               background: ${isCustom ? '#22223b' : '#ffd60a'}; color: ${isCustom ? '#adb5bd' : '#000'};">☁️ AWS ARENA</div>
          <div id="arena-custom" style="padding: 8px 22px; cursor: pointer; font-size: 13px; user-select: none;
               background: ${isCustom ? '#ffd60a' : '#22223b'}; color: ${isCustom ? '#000' : '#adb5bd'};">🔧 MY SERVER</div>
        </div>
        <input id="server-url" type="text" placeholder="https://xxxx.execute-api.us-east-1.amazonaws.com"
          value="${isCustom ? (arena.apiUrl ?? '') : ''}"
          style="width: 380px; padding: 9px; font-family: monospace; font-size: 12px;
                 background: #22223b; color: #80ffdb; border: 2px solid #4a4e69; border-radius: 4px;
                 text-align: center; outline: none; display: ${isCustom ? 'block' : 'none'};" />
        <input id="name" type="text" maxlength="20" placeholder="Racer name"
          style="width: 280px; padding: 11px; font-family: monospace; font-size: 17px;
                 background: #22223b; color: #fff; border: 2px solid #4a4e69; border-radius: 4px;
                 text-align: center; outline: none;" />
        <input id="password" type="password" maxlength="40" placeholder="Password"
          style="width: 280px; padding: 11px; font-family: monospace; font-size: 17px;
                 background: #22223b; color: #fff; border: 2px solid #4a4e69; border-radius: 4px;
                 text-align: center; outline: none;" />
      </div>
    `);
    const nameEl = form.getChildByID('name') as HTMLInputElement;
    const passEl = form.getChildByID('password') as HTMLInputElement;
    const urlEl = form.getChildByID('server-url') as HTMLInputElement;
    const awsTab = form.getChildByID('arena-aws') as HTMLDivElement;
    const customTab = form.getChildByID('arena-custom') as HTMLDivElement;

    const setTab = (custom: boolean) => {
      awsTab.style.background = custom ? '#22223b' : '#ffd60a';
      awsTab.style.color = custom ? '#adb5bd' : '#000';
      customTab.style.background = custom ? '#ffd60a' : '#22223b';
      customTab.style.color = custom ? '#000' : '#adb5bd';
      urlEl.style.display = custom ? 'block' : 'none';
    };
    awsTab.addEventListener('click', () => setTab(false));
    customTab.addEventListener('click', () => setTab(true));
    setTimeout(() => nameEl?.focus(), 100);

    const doLogin = async () => {
      const name = nameEl.value.trim();
      if (!name) { toast(this, 'Enter a name first'); return; }
      if (!passEl.value) { toast(this, 'Enter the password'); return; }
      btn.setText('[ ... ]');
      try {
        // apply arena choice BEFORE the login call
        const custom = urlEl.style.display !== 'none';
        if (custom) {
          const apiUrl = urlEl.value.trim().replace(/\/+$/, '');
          if (!/^https:\/\/.+/.test(apiUrl)) throw new Error('enter your server\'s ApiUrl (https://...)');
          const info = await probeArena(apiUrl); // validates + discovers
          saveArena({ kind: 'custom', apiUrl, name: info.arena });
          toast(this, `Connected to arena: ${info.arena}`, '#80ffdb');
        } else {
          saveArena({ kind: 'aws' });
        }
        await initConfig();

        const res = await api.login(name, passEl.value);
        this.registry.set('player', res.player);
        saveSession({ playerId: res.player.playerId, name: res.player.name });
        if (res.isNew) toast(this, `Welcome! You got the "${res.player.titles[0]}" persona`, '#80ffdb');
        this.time.delayedCall(res.isNew ? 900 : 0, () => this.scene.start('Lobby'));
      } catch (e) {
        toast(this, `Login failed: ${(e as Error).message}`);
        btn.setText('[ START ENGINE ]');
      }
    };

    const btn = button(this, this.scale.width / 2, 435, '[ START ENGINE ]', doLogin, { size: 24 });
    this.input.keyboard!.on('keydown-ENTER', doLogin);
    // stop game keys leaking from text inputs — but keep Enter = submit
    // (DOM inputs swallow keydown before Phaser sees it)
    for (const el of [urlEl, nameEl, passEl]) {
      el.addEventListener('keydown', (ev) => {
        ev.stopPropagation();
        if (ev.key === 'Enter' && !ev.isComposing) void doLogin();
      });
    }

    this.add.text(this.scale.width / 2, this.scale.height - 52,
      'AWS ARENA = official workshop server · MY SERVER = your own deployed backend (paste its ApiUrl)\nSame name = same racer. New racers get a random persona.',
      { fontFamily: FONT, fontSize: '12px', color: '#6c757d', align: 'center' }).setOrigin(0.5);
  }

  init(): void {
    initConfig();
  }
}
