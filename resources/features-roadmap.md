# Baryar Transportation & Logistics Platform - Feature Implementation Roadmap (V6)

Canonical product feature list for **Baryar (Taticom Ecosystem)**
freight and logistics. Source of truth for *what* to build:
`resources/RFP.pdf` (16 pages, published 10 Shahrivar 1405). This file is
the implementation checklist derived from that RFP. Contractor process
(SOW, bidding, contracts, NDA) stays in the PDF and is not duplicated here.

Phase 1 is the booking MVP (cargo owner + driver + admin oversight).
Phase 2 stays parked until Phase 1 booking works: live GPS, companies/fleet,
ratings, payments, KYC APIs, Telegram/WhatsApp, SMS gateway, BI.

Each row mentions exactly **one single feature** without combining multiple functionalities to provide absolute clarity for development [14, 15].

---

## Phase 1: Core Platform (v1 - MVP)
This phase covers the essential customer, driver, and administrator workflows required to book, transport, and track cargo end-to-end (RFP 4.2, 4.3). It establishes the core iOS/Android apps, scalable backend APIs, and the primary admin web panel (RFP 4.3).

> **⚠️ OPERATOR MODEL CORRECTION (2026-09-08):** The three mobile user models for the MVP are:
> 1. **صاحبان کالا / Cargo Owners (کاربر معمولی)** — the generic "user" IS the cargo owner; these roles are merged.
> 2. **رانندگان / Drivers**
> 3. **شرکت حمل و نقل / Transport Companies** — promoted from Phase 2 §2 into the MVP. A minimal corporate registration + fleet-view slice ships in Phase 1; the full corporate feature set (staff management, load allocation, reporting) remains in Phase 2.

### 1. User Application Features (اپلیکیشن کاربری — صاحبان کالا)
*   **User registration**: Allows new users to register on the platform [14].
*   **User login**: Provides secure sign-in functionality for registered users [14].
*   **User information management**: Allows users to manage their administrative and contact details [14].
*   **Profile management**: Allows users to customize and update their platform profile settings [14].
*   **Submitting transport requests**: Enables users to request a cargo transport service [14].
*   **Submitting cargo/load details**: Allows users to submit parameters and info of a new load [14].
*   **Managing cargo/load records**: Allows users to edit, update, or cancel their draft load records [14].
*   **Registering cargo for land transport (زمینی)**: Allows users to post cargo specifically for land transportation [14].
*   **Registering cargo for maritime/sea transport (دریایی)**: Allows users to post cargo specifically for maritime shipping [14].
*   **Registering cargo for air transport (هوایی)**: Allows users to post cargo specifically for air freight [14].
*   **Registering cargo for rail transport (ریلی)**: Allows users to post cargo specifically for rail transit [14].
*   **Registering cargo for multimodal/combined transport (ترکیبی)**: Allows users to post cargo for combined modes of shipping [14].
*   **Managing cargo specifications for land transport**: Allows updating and editing land cargo parameters [14].
*   **Managing cargo specifications for maritime transport**: Allows updating and editing maritime cargo parameters [14].
*   **Managing cargo specifications for air transport**: Allows updating and editing air cargo parameters [14].
*   **Managing cargo specifications for rail transport**: Allows updating and editing rail cargo parameters [14].
*   **Managing cargo specifications for multimodal transport**: Allows updating and editing multimodal cargo parameters [14].
*   **Viewing request status**: Allows users to view current active status of transport requests [15].
*   **Tracking request status**: Allows users to track changes in requested shipping services [15].
*   **Viewing cargo shipment status**: Allows users to see current milestones of their active loads [15].
*   **Tracking cargo shipment status**: Allows users to monitor progress updates of their cargo [15].
*   **Searching transportation options**: Enables users to search for matching shipment providers [15].
*   **Viewing transportation options**: Allows users to view available transport vehicles and carrier options [15].
*   **Selecting transport services**: Allows users to pick specific shipping services from search results [15].
*   **Requesting transport services**: Enables users to request a direct booking from a carrier [15].
*   **Viewing transport-related information**: Provides users with general platform transit and freight guidelines [15].
*   **Receiving system notifications**: Triggers automated alerts for account and booking actions [15].
*   **Receiving operational alerts**: Informs users of any vital logistical changes [15].
*   **Viewing transport history**: Provides users with a detailed history of past shipments [15].
*   **Contacting customer support**: Provides built-in mechanisms to connect with help desk support [15].

### 2. Cargo Owners Section (بخش صاحبان کالا)
*   **Cargo registry**: Allows cargo owners to register cargo details on the platform [15].
*   **Setting origin geographic location**: Allows owners to mark the exact loading point on the map [15].
*   **Setting destination geographic location**: Allows owners to mark the exact unloading point on the map [15].
*   **Specifying physical cargo dimensions**: Allows owners to enter load weight, volume, and sizes [15].
*   **Specifying special cargo characteristics**: Allows owners to classify hazardous, fragile, or refrigerated cargo [15].
*   **Specifying required pickup timing**: Allows owners to define the precise loading date and time [15].
*   **Specifying required delivery timing**: Allows owners to define target delivery deadlines [15].
*   **Viewing transport requests status list**: Displays a dashboard of all active and pending owner shipments [16].
*   **Viewing incoming carrier offers**: Lists incoming price bids and transport proposals from drivers [16].
*   **Viewing transport options list**: Shows available transport vehicles near cargo pickup point [16].
*   **Selecting service provider**: Enables the cargo owner to select a driver/carrier bid [16].
*   **Tracking shipment stages**: Displays sequentially updated stages of the active cargo journey [16].
*   **Viewing historical transport records**: Keeps a searchable log of all past completed shipments [16].
*   **Receiving cargo milestone alerts**: Triggers automated notifications on critical cargo updates [16].

### 3. Drivers Section (بخش رانندگان)
*   **Driver registration**: Allows new truck drivers to register on the platform [16].
*   **Driver information completion**: Allows drivers to complete their profiles and info [16].
*   **Registering vehicle specifications**: Allows drivers to input vehicle type, plate, and load capacities [16].
*   **Managing vehicle specifications**: Allows drivers to update or edit their truck parameters [16].
*   **Uploading vehicle licenses**: Allows drivers to submit copies of truck registrations and safety cards [16].
*   **Uploading driver licenses**: Allows drivers to submit digital copies of driving licenses [16].
*   **Submitting required documents**: Allows drivers to upload national identity cards and professional cards [16].
*   **Viewing matching transport requests**: Lists open cargo requests matching the driver's vehicle type and location [16].
*   **Receiving direct cargo transport offers**: Receives exclusive shipping offers dispatched to the driver [16].
*   **Managing transport proposals**: Allows drivers to organize, review, and filter incoming load offers [16].
*   **Accepting transportation requests**: Allows drivers to accept a cargo request [17].
*   **Rejecting transportation requests**: Allows drivers to reject a cargo request [17].
*   **Viewing cargo parameters**: Displays details of cargo dimensions and weight to accepted drivers [17].
*   **Viewing route destinations**: Shows transit destinations on the map to accepted drivers [17].
*   **Managing active trip status**: Allows drivers to toggle trip state (e.g. Started, At Customs, Completed) [17].
*   **Logging transit checkpoints**: Allows drivers to register custom checkpoints during delivery [17].
*   **Viewing past trip history**: Displays a personal log of all historical trips completed by the driver [17].
*   **Viewing earnings history**: Displays a dashboard of driver's financial history and past completed payouts [17].

### 4. Shipment Tracking & Status Management (رهگیری و مدیریت وضعیت حمل‌ونقل)
*   **Displaying current shipment status**: Displays the active shipment's status on the user dashboard [18].
*   **Event log creation**: Allows users to log key shipment events (e.g., "Cargo Loaded", "Driver departed") [18].
*   **Displaying status history logs**: Shows a timestamped table of all past status changes for a shipment [18].
*   **Status transition notification**: Automatically dispatches alerts when a shipment shifts to a new state [19].
*   **Recording key events timestamp**: Stores exact time and date of major events like customs stop [19].
*   **Owner cargo tracking portal**: Provides a dedicated lookup feature for cargo owners to check active loads [19].

### 5. Web Administrator Panel (پنل مدیریت تحت وب)
*   **Registered user management**: Allows administrators to view, edit, block, or delete platform users [19].
*   **Registered driver management**: Allows administrators to manage driver accounts [19].
*   **Registered transport company management**: Provides basic dashboard to view transport companies [19].
*   **Cargo database management**: Allows administrators to oversee, edit, and cancel platform cargo postings [19].
*   **Transport requests overview**: Provides monitoring of all pending and active shipping requests [19].
*   **Active trip monitoring**: Tracks all active logistics journeys on the platform [19].
*   **Platform base data management**: Allows administrators to manage base tables, zones, and static platform variables [19].
*   **Driver document verification**: Provides interfaces to verify and approve uploaded driver documents [19].
*   **Company credential verification**: Provides interfaces to verify and approve transport company legal documents [19].
*   **Role-based access control (RBAC)**: Allows assigning custom admin roles and permissions [19].
*   **System settings configuration**: Provides controls to modify global platform rules and constraints [19].

### 6. Notification & Communication System (سامانه اعلان و ارتباطات)
*   **Push notifications engine**: Powers live app notifications on Android/iOS [20].
*   **Lifecycle-triggered alerts**: Sends automated notifications based on logistics status changes [20].

### 7. Core Integrations & APIs (ارتباط با سایر سامانه‌ها)
*   **Map-based address selection and location picking**: Integrates base map APIs for visual origin and destination selection [21, 32].
*   **Integrating map routing API for path calculation**: Integrates map routing APIs to calculate and plot transit paths for shipments [32].
*   **Push notification provider integration**: Integrates a third-party push service for device-level notifications on Android/iOS [20, 32].

### 8. Phase 1 Delivery Surfaces (بسترهای تحویلی فاز ۱)
*   **iOS Mobile Application Surface**: Delivers native or cross-platform iOS mobile client application [21].
*   **Android Mobile Application Surface**: Delivers native or cross-platform Android mobile client application [21].
*   **Web Administration Panel Surface**: Delivers responsive web application for system administrators [22].
*   **Independent and Scalable Backend API Service**: Delivers independent backend API service layer [22].
*   **MVP Transport Company Slice (شرکت حمل و نقل — MVP slice)**: Minimal corporate surface shipped in Phase 1 per operator correction: `transport_company` role in `User.ROLES`, mobile company mode (role choice + tabs + placeholder company dashboard with fleet overview), so corporate users onboard from day one. Full corporate features stay in Phase 2 §2.

---

## Phase 2: Final Phase (Advanced & Corporate)
This phase introduces multi-tier corporate shipping workflows (RFP 4.2.4), real-time background GPS tracking, advanced analytics dashboards, social automation integrations, and deferred gateway, trust, and verification systems (RFP 4.2.3, 4.2.6, 4.2.8).

### 1. Advanced Tracking & GPS Features
*   **Online vehicle GPS tracking**: Allows cargo owners to view live vehicle positions on maps [16].
*   **Continuous background GPS coordinates streaming**: Streams active coordinates from driver's device [17].
*   **Interactive map tracking**: Displays live coordinate-based movement inside the Web Admin Panel [18].

### 2. Transportation Companies Section (بخش شرکت‌های حمل‌ونقل)

> **Note (2026-09-08):** Per operator correction, the **role itself and a minimal corporate slice** (registration, company mode, fleet overview placeholder) were promoted into **Phase 1 MVP** — see Phase 1 §8. The full corporate feature set below remains Phase 2.

*   **Shipping company registration**: Allows corporate logistics companies to register profiles [17]. *(MVP slice in Phase 1)*
*   **Shipping company data management**: Allows editing and updating corporate credentials [17].
*   **Corporate staff management**: Allows company admins to register and manage company personnel [17].
*   **Corporate operator management**: Allows assigning custom roles to internal company employees [17].
*   **Fleet management**: Provides registers to add, modify, and manage corporate trucks [17].
*   **Driver database management**: Allows tracking and organizing corporate-employed drivers [17].
*   **Searching open market cargo**: Allows corporate operators to look for cargoes matching fleet parameters [17].
*   **Viewing transportable cargo list**: Displays a dashboard of public cargoes open for bidding [17].
*   **Corporate transport request management**: Tracks and manages shipments assigned to the company [17].
*   **Allocating loads to vehicles**: Allows company admins to assign loads directly to specific trucks [17].
*   **Allocating loads to drivers**: Allows company admins to assign loads directly to specific drivers [17].
*   **Monitoring corporate shipment status**: Tracks all ongoing corporate logistics activities [17].
*   **Rating cargo owners by company**: Allows corporate entities to submit ratings for clients [18].
*   **Viewing company-related reviews**: Shows feedback written by drivers and owners about the company [18].
*   **Corporate activity reporting**: Generates operational reports on company shipping volume [18].
*   **Historical shipping logs**: Accesses a full historical log of corporate logistics transactions [18].

### 3. Ratings, Feedback & Mutual Social Trust System 
*   **Submitting ratings for partners**: Allows users to rate transport partners after completion [15].
*   **Submitting textual reviews for partners**: Allows users to write detailed feedback on transport partners [15].
*   **Viewing ratings of other users**: Allows users to view the rating score of prospective partners [15].
*   **Viewing textual reviews of other users**: Allows users to read written reviews on prospective partners [15].
*   **Submitting ratings on carriers**: Allows cargo owners to rate carriers [16].
*   **Viewing ratings of carriers**: Shows carrier rating scores given by other cargo owners [16].
*   **Viewing text feedback of carriers**: Shows textual feedback written about carriers by others [16].
*   **Submitting rating on cargo owners**: Allows drivers to rate cargo owners [17].
*   **Viewing ratings of cargo owners**: Shows cargo owner scores given by other drivers [17].
*   **Viewing reviews of cargo owners**: Shows textual reviews of cargo owners written by other drivers [17].
*   **Review moderation**: Allows administrators to moderate ratings, comments, and partner reviews [19].

### 4. Advanced Admin Web Panel Features
*   **Interactive business intelligence dashboards**: Provides visual charts on platform performance [19].
*   **Analytical operations reporting**: Generates system-level reports for platform owners [19].
*   **Admin activity logs (Audit Trail)**: Tracks and records all actions taken by administrators [19].
*   **User action logs**: Keeps chronological traces of critical user operations for security audit [19].
*   **Permission matrix management**: Allows fine-tuning administrative access across different sub-panels [19].

### 5. Advanced Notification & Messaging Systems 
*   **In-app notifications system**: Displays an notifications center in user profiles [20].
*   **Notification dispatch management**: Allows administrators to compose and broadcast system-wide alerts [19].
*   **In-app message broadcast**: Allows administrators to send mass text notifications to users [19].
*   **Email dispatch engine**: Sends automated email notifications for accounts and agreements [20].

### 6. User Activity Logs
*   **Viewing activity logs**: Allows users to view historical logs of their actions on the platform [15].

### 7. Advanced Integrations & API Endpoints
*   **Taticom ecosystem internal API**: Connects the platform to Taticom core system [21].
*   **External legal inquiry service integration**: Integrates automated background check APIs [21].
*   **External credit validation integration**: Integrates corporate credit checking web services [21].
*   **Telegram bot integrations**: Allows sending and receiving load data via a Telegram bot [21].
*   **WhatsApp bot integrations**: Allows sending and receiving shipment data via a WhatsApp bot [21].
*   **Automatic social channel broadcasting**: Broadcasts new open loads automatically to public channels [21].
*   **Interactive international payment gateway integration**: Integrates international banking portals for payments [21].
*   **Custom API hooks**: Connects the platform with external logistics/ERP software [21].

### 8. Identity Verification & KYC Features 
*   **User identity authentication**: Facilitates verifying the profile and identities of platform users [14].
*   **Authentication API integrations**: Connects to secure user identity verification services [20].

### 9. Core Gateway Integrations
*   **SMS Gateway API integration**: Integrates with third-party SMS providers to send standard messages [20].
*   **Domestic payment gateway integration**: Integrates domestic banking portals for transactions [21].
*   **SMS notifications engine**: Dispatches SMS alerts to user phones [20].
*   **User login authentication via SMS Phone OTP**: Integrates secure OTP logic during user sign-in and registration [32].

### 10. Future Scalability & Value-Added Services Infrastructure
*   **Creating architectural bed for future logistics value-added services**: Prepares technical core for supplementary monetization and cargo services [9, 13].

---

## Out of Scope (خارج از محدوده پروژه)
These components are explicitly outside the initial boundaries of the project design and are not included in either Phase 1 or Phase 2 implementations unless separately negotiated [22].
*   **Hardware and physical equipment development**: Design or fabrication of custom tracking units or servers [22].
*   **Mobile phones or physical GPS units provisioning**: Buying, supplying, or leasing physical handhelds or vehicle trackers [22].
*   **Server infrastructure and datacenter hosting setup**: Renting servers or cloud datacenters (unless negotiated separately) [22].
*   **External integrations requiring separate licensing or contracts**: Handling negotiations or legal fees for paid proprietary external services [22].
*   **Content creation and marketing**: Composing public media, running ad campaigns, or graphic branding [22].
*   **Business operational and HR support**: Providing customer support staff, dispatcher agents, or legal advisors [22].
*   **Unapproved features requested after SRS finalization**: Any late-stage requirements not included in the signed SRS [22, 23].

---

## Non-Functional Requirements (NFRs) & Security Standards (الزامات غیرعملکردی و استانداردهای امنیتی)
These standards define the performance, reliability, accessibility, and security benchmarks that the platform must meet across all phases [30, 31].
*   **Page load performance under 2 seconds**: Ensures user screens and views load in less than 2 seconds under normal conditions [30].
*   **API response latency under 500ms**: API backend endpoints must respond to client requests in less than 500 milliseconds [30].
*   **Horizontal scalability**: System architecture must support horizontal scaling to handle growing numbers of concurrent users and transactional volume [30].
*   **99.5% annual system availability**: Platform must maintain at least 99.5% uptime annually, integrated with automatic monitoring and alerting systems [30].
*   **End-to-end data encryption**: Secures transmission and storage of sensitive data [30].
*   **OWASP Top 10 web security compliance**: System architecture and code must be secured against the ten most critical web application security risks [30].
*   **OS compatibility with last two major versions**: Complete software compatibility with the last two major versions of iOS and Android platforms [31].
*   **Responsive application and web design**: Frontend code must dynamically adapt to varying screen widths and device sizes [31].
*   **Accessibility (a11y) standards compliance**: Visual and semantic components must be accessible to users with impairments [31].
*   **Automated database backups and Disaster Recovery (DR)**: Daily backup procedures and secondary server failover capabilities must be active [31].
*   **Privacy and data protection compliance**: Adherence to standard legal regulations regarding personal and shipping data privacy [32].
*   **Encrypted storage of sensitive authentication and payment info**: Explicitly sanitizes and encrypts passwords, bank details, and tokens in the database [33].
*   **Security audit trail logging**: Chronicling and tracking of administrative and authentication events in separate logs [33].
*   **Pre-release penetration testing**: Executing a certified pentest on the system before final deployment [33].
*   **Logging and monitoring**: Operational event logging and health checks must be active across all services [31].
*   **File / image storage**: Documents and images must live in an object store, not embedded in Mongo documents [31].
*   **Modular APIs**: System must support adding new modules and external systems without a core rewrite [31].
