# 📍 Where Registration Data is Stored

## Quick Answer

When a user registers on **dr7.app**, their data is stored in **3 different locations**:

1. **`auth.users`** table (Supabase Auth) - Email, password, basic metadata
2. **`customers_extended`** table - Full customer profile (name, CF, address, license info, etc.)
3. **Supabase Storage Buckets** - Uploaded documents (ID, license, codice fiscale scans)

---

## 📋 Complete Registration Flow

```
User visits dr7.app/signup
          ↓
Fills out SignUpPage.tsx form (name, CF, address, license, etc.)
          ↓
Clicks "Create Account"
          ↓
/.netlify/functions/register-customer
          ↓
1️⃣ Creates auth.users record (email + password)
2️⃣ Inserts into customers_extended (full profile)
          ↓
User logs in automatically
          ↓
DocumentUploadModal appears (optional)
          ↓
User uploads 5 documents (Patente front/back, CI front/back, CF)
          ↓
/.netlify/functions/upload-file
          ↓
3️⃣ Saves to Supabase Storage buckets
```

---

## 1️⃣ auth.users (Supabase Auth)

**Location**: Supabase Auth Schema  
**Table**: `auth.users`  
**Purpose**: Authentication and basic account info

### Data Stored:
```json
{
  "id": "9f4f8417-6383-42c9-9a3a-a712f8393275",
  "email": "andreiii1710@icloud.com",
  "encrypted_password": "...",
  "email_confirmed_at": null,
  "raw_user_meta_data": {
    "source": "website_registration"
  },
  "created_at": "2026-01-09 20:34:08.117584+01"
}
```

### Created By:
- **File**: `netlify/functions/register-customer.js`
- **Method**: `supabase.auth.admin.createUser()`

---

## 2️⃣ customers_extended (Customer Profile)

**Location**: Public Schema  
**Table**: `customers_extended`  
**Purpose**: Complete customer profile for CRM and invoicing

### Data Stored (Persona Fisica Example):

```sql
INSERT INTO customers_extended (
  user_id,                    -- Links to auth.users
  tipo_cliente,               -- 'persona_fisica', 'azienda', or 'pubblica_amministrazione'
  source,                     -- 'website'
  
  -- Personal Info
  nome,                       -- "Andrea"
  cognome,                    -- "Pilia"
  email,                      -- "andreiii1710@icloud.com"
  telefono,                   -- "3514847361"
  codice_fiscale,             -- "GRAMRC02A30B745U"
  sesso,                      -- "M" or "F"
  data_nascita,               -- "2002-01-30"
  citta_nascita,              -- "Cagliari"
  provincia_nascita,          -- "CA"
  
  -- Address
  indirizzo,                  -- "Via Roma"
  numero_civico,              -- "123"
  citta_residenza,            -- "Cagliari"
  provincia_residenza,        -- "CA"
  codice_postale,             -- "09100"
  nazione,                    -- "Italia"
  
  -- License Info (stored in metadata JSONB)
  metadata                    -- {
                              --   "tipo_patente": "B",
                              --   "numero_patente": "CA1234567",
                              --   "patente_emessa_da": "MIT",
                              --   "patente_data_rilascio": "2020-05-15",
                              --   "patente_scadenza": "2030-05-15"
                              -- }
) VALUES (...);
```

### Created By:
- **File**: `netlify/functions/register-customer.js`
- **Method**: `supabase.from('customers_extended').insert()`
- **Triggered**: Immediately after creating `auth.users` record

### For Azienda (Company):
Additional fields stored:
- `denominazione` (company name)
- `partita_iva` (VAT number)
- `rappresentante_nome` (legal rep name)
- `rappresentante_cognome` (legal rep surname)
- `rappresentante_cf` (legal rep CF)
- `rappresentante_ruolo` (legal rep role)
- `metadata.documento_tipo` (ID type)
- `metadata.documento_numero` (ID number)
- `metadata.documento_data_rilascio` (ID issue date)
- `metadata.documento_luogo_rilascio` (ID issue place)

---

## 3️⃣ Supabase Storage (Document Scans)

**Location**: Supabase Storage  
**Purpose**: Store uploaded document images/PDFs

### Storage Buckets:

| Bucket Name | Document Type | Files Stored |
|------------|---------------|--------------|
| `driver-licenses` | Patente di guida | `{userId}/patente_front_{timestamp}.jpg`<br>`{userId}/patente_back_{timestamp}.jpg` |
| `carta-identita` | Carta d'Identità | `{userId}/carta_front_{timestamp}.jpg`<br>`{userId}/carta_back_{timestamp}.jpg` |
| `codice-fiscale` | Codice Fiscale | `{userId}/codice_fiscale_{timestamp}.jpg` |

### Example File Paths:
```
driver-licenses/9f4f8417-6383-42c9-9a3a-a712f8393275/patente_front_1736453648117.jpg
driver-licenses/9f4f8417-6383-42c9-9a3a-a712f8393275/patente_back_1736453648117.jpg
carta-identita/9f4f8417-6383-42c9-9a3a-a712f8393275/carta_front_1736453648117.jpg
carta-identita/9f4f8417-6383-42c9-9a3a-a712f8393275/carta_back_1736453648117.jpg
codice-fiscale/9f4f8417-6383-42c9-9a3a-a712f8393275/codice_fiscale_1736453648117.jpg
```

### Created By:
- **Component**: `components/ui/DocumentUploadModal.tsx`
- **Function**: `netlify/functions/upload-file.js`
- **Triggered**: After successful registration, user optionally uploads documents

### Document Tracking Table:
Documents may also be tracked in `user_documents` table:
```sql
CREATE TABLE user_documents (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  document_type TEXT,  -- 'drivers_license', 'identity_document', 'codice_fiscale'
  file_path TEXT,      -- Path in storage bucket
  upload_date TIMESTAMP,
  status TEXT          -- 'pending', 'verified', 'rejected'
);
```

---

## 🔍 How to Find Andrea Pilia's Data

### 1. Check Auth Account
```sql
SELECT 
  id,
  email,
  created_at,
  email_confirmed_at,
  raw_user_meta_data
FROM auth.users
WHERE email = 'andreiii1710@icloud.com';
```

### 2. Check Customer Profile
```sql
SELECT 
  ce.*,
  au.email as auth_email,
  au.created_at as registration_date
FROM customers_extended ce
JOIN auth.users au ON ce.user_id = au.id
WHERE au.email = 'andreiii1710@icloud.com';
```

### 3. Check Uploaded Documents
```sql
SELECT 
  document_type,
  file_path,
  upload_date,
  status
FROM user_documents
WHERE user_id = (
  SELECT id FROM auth.users WHERE email = 'andreiii1710@icloud.com'
);
```

### 4. List Files in Storage
Go to Supabase Dashboard → Storage → Select bucket → Navigate to user folder:
- `driver-licenses/9f4f8417-6383-42c9-9a3a-a712f8393275/`
- `carta-identita/9f4f8417-6383-42c9-9a3a-a712f8393275/`
- `codice-fiscale/9f4f8417-6383-42c9-9a3a-a712f8393275/`

---

## ⚠️ Why Some Users Have Incomplete Data

Looking at your data sample, many users have:
- ✅ Email (in `auth.users`)
- ✅ Full name (in `auth.users.raw_user_meta_data`)
- ❌ Missing: `codice_fiscale`, `indirizzo`, `telefono`

### Reason:
These users likely registered using a **simplified flow** or **skipped the full registration form**. There are two possible scenarios:

1. **Old Registration Flow**: Before `SignUpPage.tsx` was implemented, users only provided email + password
2. **Skipped Document Upload**: Users clicked "Salta" (Skip) on the DocumentUploadModal

### Solution:
Users can complete their profile later by:
- Visiting `/account` page
- Filling out missing fields
- Uploading documents

---

## 📊 Data Coverage Summary

| Field | Source | Always Present? |
|-------|--------|----------------|
| Email | `auth.users.email` | ✅ Yes |
| Password | `auth.users.encrypted_password` | ✅ Yes |
| Full Name | `customers_extended.nome` + `cognome` | ⚠️ Only if form completed |
| Phone | `customers_extended.telefono` | ⚠️ Only if form completed |
| Codice Fiscale | `customers_extended.codice_fiscale` | ⚠️ Only if form completed |
| Address | `customers_extended.indirizzo` | ⚠️ Only if form completed |
| License Info | `customers_extended.metadata` | ⚠️ Only if form completed |
| Document Scans | Supabase Storage | ⚠️ Only if uploaded |

---

## 🎯 Key Takeaways

1. **Registration creates 2 records**: `auth.users` + `customers_extended`
2. **Documents are optional**: Stored separately in Supabase Storage
3. **Incomplete profiles are normal**: Users can skip extended info and complete later
4. **Admin panel should handle both**: Show users even if profile is incomplete
