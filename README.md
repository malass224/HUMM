# HUMM — SaaS WhatsApp Autonome 24h/24

**HUMM** est une solution SaaS WhatsApp minimaliste et confidentielle conçue pour les comptes WhatsApp personnels. Elle permet à l'utilisateur de récupérer discrètement un contenu reçu en vue unique et de le transférer exclusivement vers son chat privé désigné grâce à l'unique commande :

```text
.humm
```

---

## 1. Fonctionnement & Confidentialité

* **Compte personnel WhatsApp** : Fonctionne directement avec votre compte WhatsApp personnel (via connexion sécurisée QR code multi-device).
* **Commande unique `.humm`** : Il suffit de citer/répondre à un message contenant un média en vue unique (photo, vidéo, audio) en tapant `.humm`.
* **Discrétion absolue** :
  * Aucun message, réaction ou accusé n'est envoyé dans la conversation d'origine.
  * L'expéditeur initial ne reçoit rien et ne s'aperçoit de rien.
  * Le contenu extrait est acheminé directement et uniquement vers votre chat privé désigné (ou dans votre discussion personnelle « Message à vous-même »).
* **Autonomie totale 24 h/24** : Le moteur tourne dans le cloud de manière persistante. Votre ordinateur (ex: MacBook) n'a pas besoin de rester allumé.

---

## 2. Architecture Technique

| Composant | Technologie | Rôle & Hébergement |
| :--- | :--- | :--- |
| **Dashboard Web** | Next.js 14, Tailwind CSS, TypeScript | Tableau de bord épuré hébergé sur **Vercel** |
| **Moteur WhatsApp** | Node.js, `@whiskeysockets/baileys` | Processus persistant 24h/24 hébergé sur **Railway**, **Render** ou **VPS Docker** |
| **Base & Realtime** | Supabase (PostgreSQL + RLS + Realtime) | Synchronisation instantanée du QR code, de l'état et des logs |

---

## 3. Structure du Projet

```
humm/
├── web/                       # Application Dashboard Next.js (pour Vercel)
│   ├── app/                   # Pages App Router (Dashboard, Login, API Routes)
│   ├── components/            # Composants UI (StatusBadge, QrCodeDisplay, DestinationInput, BotControls, ActivityLogs)
│   ├── lib/                   # Clients Supabase navigateur/serveur et types
│   └── package.json
│
├── bot/                       # Moteur de bot persistant (pour Railway / VPS)
│   ├── src/
│   │   ├── index.ts           # Point d'entrée HTTP & écoute Supabase
│   │   ├── whatsapp.ts        # Client Baileys, gestion du cycle de vie et sessions
│   │   ├── handler.ts         # Traitement strict de la commande unique .humm
│   │   ├── media.ts           # Déchiffrement et téléchargement de vue unique
│   │   └── supabase.ts        # Synchronisation base de données et logs
│   ├── Dockerfile             # Conteneurisation de production
│   └── package.json
│
├── supabase/
│   └── schema.sql             # Schéma SQL complet (tables, RLS, triggers, Realtime)
│
├── deploy/
│   ├── docker-compose.yml     # Déploiement en 1 commande sur VPS avec volume persistant
│   ├── railway.json           # Déploiement 1-clic sur Railway
│   └── render.yaml            # Déploiement sur Render
│
└── README.md                  # Guide complet d'installation et déploiement
```

---

## 4. Guide de Déploiement Pas à Pas

### Étape 1 : Configuration de Supabase (Gratuit)

1. Rendez-vous sur [supabase.com](https://supabase.com) et créez un projet (gratuit).
2. Dans le menu de gauche, ouvrez l'**Éditeur SQL** (SQL Editor).
3. Ouvrez le fichier `supabase/schema.sql` de ce projet, copiez l'intégralité de son contenu et exécutez-le dans Supabase.
4. Rendez-vous dans **Project Settings > API** et notez :
   * **Project URL** (ex: `https://xyzcompany.supabase.co`)
   * **anon public key**
   * **service_role secret key** (gardez-la secrète, elle sert uniquement pour le moteur de bot)

---

### Étape 2 : Déploiement du Dashboard Web sur Vercel

1. Créez un dépôt Git (GitHub ou GitLab) et poussez le code du projet `humm`.
2. Connectez-vous sur [vercel.com](https://vercel.com) et cliquez sur **Add New > Project**.
3. Sélectionnez votre dépôt et définissez le **Root Directory** sur `web`.
4. Ajoutez les deux variables d'environnement suivantes :
   * `NEXT_PUBLIC_SUPABASE_URL` = *Votre URL de projet Supabase*
   * `NEXT_PUBLIC_SUPABASE_ANON_KEY` = *Votre clé publique anon Supabase*
5. Cliquez sur **Deploy**. Votre interface SaaS est désormais en ligne avec une URL HTTPS !

---

### Étape 3 : Déploiement du Moteur WhatsApp 24h/24 (Autonome)

Le moteur de bot a besoin d'un environnement persistant avec un volume de disque pour conserver la session WhatsApp connectée même en cas de redémarrage.

#### Option A : Déploiement sur Railway.app (Recommandé, simple et rapide)
1. Créez un compte sur [railway.app](https://railway.app).
2. Cliquez sur **New Project > Deploy from GitHub repo** et sélectionnez votre dépôt.
3. Dans les paramètres du service :
   * Définissez le **Root Directory** sur `/bot`.
   * Ou utilisez le Dockerfile situé dans `bot/Dockerfile`.
4. **Ajoutez un Volume Persistant** (Essentiel pour ne pas perdre la connexion) :
   * Dans l'onglet **Volumes**, ajoutez un volume monté sur `/app/sessions`.
5. Renseignez les variables d'environnement :
   * `NODE_ENV` = `production`
   * `PORT` = `3001`
   * `SUPABASE_URL` = *Votre URL Supabase*
   * `SUPABASE_SERVICE_ROLE_KEY` = *Votre clé secrète service_role*
   * `SESSION_DATA_PATH` = `/app/sessions`
6. Le moteur démarre automatiquement et reste en ligne en continu 24 h/24.

#### Option B : Déploiement sur un VPS avec Docker (Hetzner, OVH, DigitalOcean)
Si vous possédez un VPS Linux :
```bash
# Clonez votre dépôt
git clone <url-du-repo>
cd humm/deploy

# Configurez les variables dans un fichier .env
cat <<EOF > .env
SUPABASE_URL=https://votre-projet.supabase.co
SUPABASE_SERVICE_ROLE_KEY=votre-cle-service-role
EOF

# Lancez le service en arrière-plan
docker compose up -d --build
```

---

## 5. Première Connexion & Utilisation

1. Accédez à votre tableau de bord déployé sur Vercel.
2. Créez un compte avec votre adresse e-mail puis connectez-vous.
3. **Configurez le chat privé de destination** :
   * Saisissez le numéro international (ex: `33612345678`) dans le champ prévu à cet effet et cliquez sur **Enregistrer**.
   * *Astuce* : Laissez vide si vous souhaitez recevoir le média directement dans votre propre discussion personnelle WhatsApp (« Vous »).
4. Cliquez sur **Démarrer HUMM**.
5. Le QR code apparaît à l'écran :
   * Ouvrez WhatsApp sur votre smartphone.
   * Allez dans **Réglages (ou menu ⋮) > Appareils connectés > Connecter un appareil**.
   * Scannez le QR code affiché sur l'écran.
6. Le statut passe instantanément au vert : **Connecté**.

### Utilisation de la commande `.humm` :
* Dès que vous recevez un média en vue unique dans n'importe quel chat (privé ou groupe) :
* **Citez / Répondez** simplement à ce message avec le texte :
  ```text
  .humm
  ```
* Le contenu est immédiatement déchiffré et transféré dans votre chat privé désigné.
* La personne d'origine ne reçoit aucune notification ni accusé de lecture spécifique.

---

## 6. Journalisation & Sécurité

* **Protection des identifiants** : Les clés de session WhatsApp (`useMultiFileAuthState`) sont stockées exclusivement sur le volume privé du serveur et ne sont jamais exposées à l'interface publique.
* **RLS PostgreSQL** : Chaque utilisateur ne peut voir que sa propre configuration et ses propres journaux d'activité.
* **Anti-doublon** : Un cache d'empreintes numériques garantit qu'aucun message n'est traité deux fois en cas de latence réseau.
* **Surveillance Uptime** : Le moteur expose un point d'accès `GET /health` compatible avec les outils de monitoring gratuits (comme UptimeRobot ou BetterUptime).
