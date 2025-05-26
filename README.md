# Sheng Tai International – Mock Mobile Web App (Next.js + Tailwind + shadcn/ui)

> **Objetivo:** Criar um mock navegável (somente front-end) para visualizar o fluxo de tokenização de quartos de dois hotéis: **THE SAIL** e **NYRA** (Malásia). Não haverá backend, lógica de carteira, nem blockchain neste estágio.

---

## Páginas do Mock e Conteúdo

### `/` – Landing Page

- **Hero:** título e subtítulo com chamada para ação
- **Botão "Começar"** levando ao catálogo (`/discover`)
- **Mini-cards** com destaque visual dos dois hotéis
- **Footer** com nome da plataforma

---

### `/discover` – Catálogo de Hotéis

- **Navbar** simples com título
- **Lista de HotelCard**: imagem, nome, ROI, progresso de venda
- **Filtros simulados**: ROI, status
- Cada card leva para `/hotel/the-sail` ou `/hotel/nyra`

---

### `/hotel/the-sail` e `/hotel/nyra` – Página do Hotel

- **Carrossel de imagens do hotel**
- **StatBar** com ROI garantido, cláusula de recompra (buyback), preço por token
- **Tabs:**

  - _Visão Geral:_ breve descrição do hotel
  - _Quartos:_ tabela com as tipologias disponíveis (A, B, C...)

    - Cada linha abre o **UnitSheet** para simular compra de tokens

  - _FAQs:_ perguntas frequentes do investimento

---

### `UnitSheet` (componente Sheet)

- **Informações da unidade** (tipo, área, valor total)
- Campo para **quantidade de tokens**
- **Subtotal** calculado (qty × valor por token)
- Botão **Comprar** que abre `CheckoutDialog`

---

### `CheckoutDialog` (componente Dialog)

- **Resumo da compra** (hotel, tipo, tokens, valor total)
- Botão _Confirmar_
- Ao confirmar, mostra **Toast** de sucesso e adiciona à carteira mock

---

### `/portfolio` – Carteira Simulada

- **Resumo geral**: total investido, retorno estimado
- **Tabela TokenTable**: hotel, tipo de quarto, tokens comprados, valor atual estimado

---

### `/about` – Sobre a Empresa

- Texto explicando a SHENG TAI JAPAN e sua proposta
- Links para os dois PDFs dos hotéis: THE SAIL e NYRA

---

### `not-found.tsx` – Página 404

- Mensagem de página não encontrada
- Link para retornar à home (`/`)

---

## Dados dos Hotéis (Exemplo em JSON)

```ts
export const hotels = [
  {
    id: "sail",
    name: "THE SAIL Hotel Tower",
    location: "Malaca, MY",
    roiGuaranteed: "5–8% a.a.",
    buyback: "170% no 19º ano",
    thumbnail: "/images/sail_thumb.jpg",
    units: [
      { type: "A", size: 38, price: 34000000, tokens: 10000 },
      { type: "B", size: 56, price: 42000000, tokens: 10000 },
      { type: "C", size: 27, price: 30000000, tokens: 10000 },
    ],
  },
  {
    id: "nyra",
    name: "NYRA Oceanview Hotel",
    location: "Malaca, MY",
    roiGuaranteed: "8% a.a.",
    buyback: "100% no 9º ano",
    thumbnail: "/images/nyra_thumb.jpg",
    units: [
      { type: "A", size: 44.5, price: 19300000, tokens: 10000 },
      { type: "B", size: 53.1, price: 23400000, tokens: 10000 },
      { type: "E", size: 70.3, price: 30200000, tokens: 10000 },
    ],
  },
];
```

---

## Componentes Usados (shadcn/ui)

- `HotelCard`
- `StatBar`
- `UnitSheet`
- `CheckoutDialog`
- `TokenTable`
- `ThemeToggle`

---

## Observações

- Tudo é simulado, os dados vêm de um JSON local
- Sem integração de carteira, backend ou blockchain
- Não será feito deploy nesta fase
- Mock serve apenas para apresentação visual do projeto
