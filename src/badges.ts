/**
 * DuoPlay — Sistema de Perfil, Personalización y Medallas (Insignias estilo Discord)
 */

export interface Badge {
  id: string;
  icon: string;
  name: string;
  desc: string;
  color: string;
  unlockedByDefault?: boolean;
}

export const ALL_BADGES: Badge[] = [
  {
    id: 'og-founder',
    icon: '🌟',
    name: 'Veterano Pionero',
    desc: 'Jugador fundador de DuoPlay en sus primeros días.',
    color: '#fdcb6e',
    unlockedByDefault: true,
  },
  {
    id: 'streak-king',
    icon: '👑',
    name: 'Rey de la Racha',
    desc: 'Alcanza una racha de 3 o más victorias consecutivas.',
    color: '#f1c40f',
  },
  {
    id: 'tetris-master',
    icon: '🧩',
    name: 'Maestro del Tetris',
    desc: 'Coordina líneas cooperativas en Tetris Dual.',
    color: '#0984e3',
  },
  {
    id: 'balloon-ace',
    icon: '🎈',
    name: 'Acróbata del Globo',
    desc: 'Mantén el globo en el aire por más de 30 segundos.',
    color: '#e84393',
  },
  {
    id: 'minesweeper-pro',
    icon: '💣',
    name: 'Desactivador Élite',
    desc: 'Completa un tablero de Buscaminas con éxito.',
    color: '#d63031',
  },
  {
    id: 'glass-walker',
    icon: '🌉',
    name: 'Paso Firme',
    desc: 'Cruza con vida el traicionero Puente de Cristal.',
    color: '#00cec9',
  },
  {
    id: 'star-catcher',
    icon: '⭐',
    name: 'Sincronía Pura',
    desc: 'Pesca estrellas con sincronización perfecta.',
    color: '#ffeaa7',
  },
  {
    id: 'gravity-pilot',
    icon: '🚀',
    name: 'As de la Gravedad',
    desc: 'Recorre más de 300m en Gravedad Invertida.',
    color: '#6c5ce7',
  },
  {
    id: 'hockey-legend',
    icon: '🏒',
    name: 'Terror de la IA',
    desc: 'Vence a los robots en Hockey de Dedos.',
    color: '#00b894',
  },
  {
    id: 'bot-whisperer',
    icon: '🤖',
    name: 'Compañero Sintético',
    desc: 'Juega o entrena una partida con DuoBot.',
    color: '#636e72',
  },
  {
    id: 'party-soul',
    icon: '🎉',
    name: 'Alma de la Fiesta',
    desc: 'Envía 5 o más reacciones en vivo durante una sesión.',
    color: '#e17055',
  },
  {
    id: 'unbreakable-duo',
    icon: '💎',
    name: 'Dúo Imparable',
    desc: 'Juega todos los minijuegos de la colección.',
    color: '#74b9ff',
  },
];

export interface UserProfileData {
  customName: string;
  avatarIcon: string;
  accessory: string; // '', '👑', '🥳', '😎', '😈', '😇', '🥸'
  unlockedBadgeIds: string[];
  equippedBadgeIds: string[]; // max 3
  sessionStreak: number;
  bestStreak: number;
}

const STORAGE_KEY = 'duoplay_profile_v1';

export class ProfileManager {
  private profile: UserProfileData;

  constructor() {
    this.profile = this.load();
  }

  private load(): UserProfileData {
    const defaultData: UserProfileData = {
      customName: '',
      avatarIcon: '🐱',
      accessory: '',
      unlockedBadgeIds: ['og-founder'],
      equippedBadgeIds: ['og-founder'],
      sessionStreak: 0,
      bestStreak: 0,
    };

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          ...defaultData,
          ...parsed,
          unlockedBadgeIds: Array.from(new Set([...defaultData.unlockedBadgeIds, ...(parsed.unlockedBadgeIds || [])])),
        };
      }
    } catch (_) {}

    return defaultData;
  }

  public save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profile));
    } catch (_) {}
  }

  public getProfile(): UserProfileData {
    return { ...this.profile };
  }

  public updateProfile(updates: Partial<UserProfileData>) {
    Object.assign(this.profile, updates);
    this.save();
  }

  public unlockBadge(badgeId: string): boolean {
    const badge = ALL_BADGES.find(b => b.id === badgeId);
    if (!badge) return false;

    if (!this.profile.unlockedBadgeIds.includes(badgeId)) {
      this.profile.unlockedBadgeIds.push(badgeId);
      // Auto-equip if under 3
      if (this.profile.equippedBadgeIds.length < 3) {
        this.profile.equippedBadgeIds.push(badgeId);
      }
      this.save();
      return true; // Newly unlocked
    }
    return false;
  }

  public toggleEquipBadge(badgeId: string): boolean {
    if (!this.profile.unlockedBadgeIds.includes(badgeId)) return false;

    const idx = this.profile.equippedBadgeIds.indexOf(badgeId);
    if (idx >= 0) {
      this.profile.equippedBadgeIds.splice(idx, 1);
    } else {
      if (this.profile.equippedBadgeIds.length >= 3) {
        this.profile.equippedBadgeIds.shift(); // Remove oldest to make room
      }
      this.profile.equippedBadgeIds.push(badgeId);
    }
    this.save();
    return true;
  }

  public addWin() {
    this.profile.sessionStreak++;
    if (this.profile.sessionStreak > this.profile.bestStreak) {
      this.profile.bestStreak = this.profile.sessionStreak;
    }
    if (this.profile.sessionStreak >= 3) {
      this.unlockBadge('streak-king');
    }
    this.save();
  }

  public resetStreak() {
    this.profile.sessionStreak = 0;
    this.save();
  }
}

export const profileManager = new ProfileManager();
