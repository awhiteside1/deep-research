# How Aircraft Are Tracked Over the Ocean

Commercial aircraft are tracked over the ocean by combining **aircraft-broadcast surveillance**, **satellite and relay communications**, and **procedural air traffic control methods**. The key constraint is that the usual land-based surveillance toolkit — especially ground radar — fades away once an aircraft gets far from shore. Over the ocean, ATC can no longer depend on a continuous radar picture in the way it can over continental airspace, so tracking becomes a hybrid of onboard reporting, satellite reception, and rule-based separation.

## Executive summary

The short version is straightforward:

- **Near land**, aircraft are tracked normally with **radar** and **terrestrial ADS-B**.
- **Far out over the ocean**, ground radar usually disappears, so aircraft are tracked using:
  - **ADS-B**, increasingly received by **space-based ADS-B satellites**
  - **ADS-C**, which sends automatic position reports over **satellite communications (SATCOM)**
  - **HF voice radio** position reports in some oceanic areas or as backup
  - **Procedural separation** rules when real-time surveillance is limited

For commercial aviation, this is not a single system but an operational stack. The aircraft broadcasts or reports its own position, satellites or ground stations receive the data, and air traffic service providers apply oceanic procedures to maintain safe separation. In modern oceanic operations, the big enabler is **space-based ADS-B**, which extends surveillance far beyond radar range and gives controllers a much more continuous view of equipped aircraft.

## 1) Why oceanic tracking is different

Over land, ATC surveillance is usually built around **ground radar** and **terrestrial ADS-B receivers**. Those systems depend on infrastructure on the ground. Over the ocean, that infrastructure is sparse or absent. As the aircraft moves away from shore, the radar picture weakens and eventually disappears entirely.

That creates a fundamental operational problem: ATC still needs to know where the airplane is, but the normal “see-and-separate” model no longer works in the same way. Oceanic airspace therefore relies on a combination of:

- **self-reporting by the aircraft**,
- **satellite relay of those reports**, and
- **procedural control** that uses time, route, and estimate-based separation rather than a continuous radar feed.

This is why oceanic flight tracking is often described as a layered system rather than a single technology.

## 2) ADS-B: the aircraft broadcasts its own position

The foundational surveillance technology is **ADS-B Out**. In this system, the aircraft determines its own position using **GPS or another positioning source**, then broadcasts that position along with other data such as:

- **position**
- **altitude**
- **ground speed**
- **other data**

ADS-B is important because it is not a radar reflection method. The aircraft is actively transmitting its own state information. The FAA describes ADS-B as combining the aircraft’s positioning source, avionics, and ground infrastructure into an accurate surveillance interface with ATC, and notes that it is **more precise than radar**.

That precision matters in oceanic airspace because once a plane is no longer visible to ground radar, a broadcast system can continue to provide usable surveillance — if someone can receive the broadcast.

### Practical implication

On a purely technical level, ADS-B gives the system a much more accurate source of aircraft state than radar does. Operationally, it also simplifies the tracking problem: instead of inferring where the aircraft is from reflected energy, ATC gets a direct broadcast of the aircraft’s own data.

## 3) Space-based ADS-B extends coverage over oceans

The major modern shift in oceanic tracking is **space-based ADS-B**. Because ADS-B is broadcast from the aircraft, satellites can receive those transmissions far beyond the range of terrestrial receivers. That is the key reason oceanic surveillance has improved so much in recent years.

FAA material notes that **space-based ADS-B has been evaluated for oceanic use**, and that its **performance can be good in oceanic areas**, though there are **limitations in some spectrum-congested regions and for aircraft antenna configurations**.

Those caveats matter. In other words, space-based ADS-B is not magically perfect everywhere. Performance can be affected by:

- local spectrum congestion in certain regions,
- how the aircraft antenna is configured,
- and by the general realities of receiving broadcast signals from orbit.

Still, in practice, **space-based ADS-B lets ATC see equipped aircraft over remote oceanic airspace much more continuously than older methods**. That continuity is the big operational breakthrough. Instead of relying only on periodic reports or voice check-ins, controllers can often receive surveillance updates from aircraft that are many hundreds or thousands of miles from shore.

### Why this is so important

Before space-based ADS-B, the surveillance picture over oceanic regions was much more fragmented. Aircraft might be tracked procedurally or by infrequent reports, but not continuously. Space-based ADS-B closes much of that gap by allowing the aircraft’s broadcast to be received in places that ground infrastructure cannot reach.

## 4) ADS-C and CPDLC: procedural control with automatic reports

Where surveillance is incomplete — or where the air traffic service unit uses procedural methods — aircraft can send **automatic position reports** via **ADS-C** over **satellite communications**.

ADS-C is operationally different from ADS-B. Rather than simply broadcasting a constantly available surveillance signal, the aircraft sends reports automatically, often at intervals or when certain events occur. Those reports can include position and intent information, which ATC can use even when continuous surveillance is not available.

This supports a style of oceanic control in which:

- the aircraft periodically or event-triggered sends reports,
- ATC receives position and intent information without requiring a voice call every time,
- and controllers can apply **reduced separation in some oceanic procedures when authorized and equipped**.

This is why oceanic aviation discussions often refer to **FANS / SATCOM / CPDLC / ADS-C** together. Those terms usually appear as a cluster because they support the same operational concept: digital communications and reporting in airspace where conventional radar is absent.

### CPDLC in the operational stack

Although the findings center on ADS-C, the mention of **CPDLC** is important because it is often part of the same communications environment. In oceanic operations, CPDLC reduces reliance on voice, improves message clarity, and supports the procedural management of aircraft that are outside normal radar coverage.

### The key operational effect

ADS-C and CPDLC do not just make tracking possible; they make tracking and control more scalable. Controllers can get aircraft position and intent data in a structured form, which is especially useful when managing long oceanic routes with limited surveillance.

## 5) HF voice radio: legacy method and backup

Before satellite-based systems became widespread, aircraft crossing oceans relied heavily on **HF voice radio** to pass position reports to ATC. That method still exists in some regions or as a backup, but it is **slower and less efficient than digital reporting**.

HF remains relevant because oceanic aviation has to plan for resilience. If satellite-based systems are degraded, unavailable, or not fully implemented in a region, HF voice can still serve as a fallback communications path. But compared with ADS-B, ADS-C, and CPDLC, it is labor-intensive and less efficient.

### What HF voice means operationally

In an HF-based environment, pilots may have to read position reports over radio at specified points. ATC then manually integrates those reports into the traffic picture. That is workable, but it lacks the speed, precision, and automation of modern digital surveillance.

## 6) What ATC actually does over the ocean

Over oceanic airspace, controllers often cannot “see” aircraft the way they do on radar. As a result, they manage traffic using a blend of surveillance data and procedural methods.

ATC typically relies on:

- **known aircraft positions** from ADS-B and ADS-C,
- **planned routes**,
- **time estimates**,
- **required reporting points**,
- and **separation standards** designed for limited-surveillance environments.

This is a fundamental difference from continental radar control. Over the ocean, the controller’s job is not just to watch a live radar sweep; it is to reconcile broadcast reports, route structures, and timing estimates into a safe traffic plan.

### Surveillance available vs. surveillance unavailable

When **real-time surveillance is available**, ATC can provide better spacing and more direct routing. That is, aircraft can often be managed with tighter situational awareness and less conservative assumptions.

When **real-time surveillance is not available**, ATC relies more heavily on **procedural methods**. In practice, that means separation is maintained using preplanned routes, report points, and estimates rather than continuous visual or radar-style tracking.

## 7) Who provides the tracking?

Oceanic tracking is not owned by one actor alone. It is a distributed system involving several parties:

- **ANSPs / ATC providers** in each oceanic region use the surveillance data
- **ICAO procedures** define how oceanic airspace is managed
- **Satellite service providers** can supply space-based ADS-B data
- **Airlines** equip aircraft with the required avionics and communications systems

This division of labor is important.

- The **airline** installs and maintains the onboard equipment.
- The **satellite provider** may receive and relay the signals.
- The **ANSP** uses the data to provide air traffic services.
- **ICAO procedures** supply the framework for how the airspace is organized and how separation is maintained.

The result is a coordinated surveillance and control network rather than a single monolithic system.

## 8) How the pieces fit together in practice

A good way to think about oceanic tracking is by distance from land.

### Near shore

When the aircraft is near land, standard surveillance is available:

- **ground radar**
- **terrestrial ADS-B**

In this environment, tracking looks similar to domestic operations. Controllers have a conventional live picture of the airplane.

### Transition zone

As the aircraft moves farther from land, radar coverage falls off. At that point, the surveillance picture increasingly depends on the aircraft’s own transmissions:

- **ADS-B broadcasts**
- **ADS-C reports via SATCOM**
- sometimes **HF voice reports**

### Deep oceanic airspace

Far from land, **ground radar usually disappears**. Here, aircraft are tracked primarily through:

- **space-based ADS-B** where available,
- **ADS-C over SATCOM**,
- **HF voice** in some regions or as backup,
- and **procedural ATC** when continuous surveillance is not available.

That deep-ocean phase is where the difference between older and newer systems is most obvious. Space-based ADS-B can provide a near-continuous surveillance layer over remote areas, while ADS-C and procedural control ensure that aircraft can still be safely managed even when the surveillance picture is not continuous.

## 9) Why commercial aircraft are the main focus here

The findings are centered on **commercial aviation**, and that matters because commercial flights dominate long-haul oceanic operations. These aircraft routinely cross the North Atlantic, Pacific, and other oceanic corridors where ground radar is absent.

Commercial aircraft are also generally equipped with the avionics and communications suites needed for:

- ADS-B Out,
- ADS-C,
- SATCOM,
- CPDLC,
- and sometimes HF voice capability.

That equipment stack is what makes modern oceanic operations possible at scale. Military aircraft may use different methods and operational rules, but for commercial operations the combination above is the standard architecture.

## 10) The practical bottom line

Commercial aircraft over the ocean are tracked primarily by **their own broadcasts** rather than by ground radar.

The main tracking methods are:

- **ADS-B** for broadcast surveillance
- **space-based ADS-B** to receive those broadcasts over oceans
- **ADS-C over SATCOM** and sometimes **HF voice** for position reporting
- **procedural ATC** when continuous surveillance is not available

The modern system is therefore best understood as a layered surveillance ecosystem. The aircraft provides its own position data, satellites or relays receive it, and controllers apply oceanic procedures to keep aircraft safely separated.

## 11) A concise operational interpretation

If you want the deepest one-sentence explanation, it is this:

> Over oceanic airspace, commercial aircraft are tracked by combining onboard broadcast surveillance, satellite-enabled reception, and procedural air traffic control because ground radar coverage does not extend far offshore.

That sentence captures the architecture, but not the full operational nuance. The nuance is that:

- **ADS-B** is the main broadcast surveillance tool,
- **space-based ADS-B** is the modern enabler that extends that visibility over oceans,
- **ADS-C and CPDLC via SATCOM** support reporting and coordination where surveillance is incomplete,
- **HF voice** remains a slower legacy or backup method,
- and **procedural separation** is the safety framework when the surveillance picture is less than continuous.

## 12) Final takeaway

The ocean is not a surveillance void; it is a place where surveillance must be delivered differently. The modern answer to “how are aircraft tracked over the ocean?” is: **by the aircraft tracking itself and reporting that data outward, with satellites and oceanic ATC systems receiving and using the information**.

In the past, oceanic tracking depended heavily on HF voice and procedural methods. Today, **ADS-B plus space-based reception** is transforming that environment, while **ADS-C over SATCOM** and **procedural control** remain essential components of the system. The result is a much more continuous, precise, and operationally efficient picture of commercial traffic over remote oceanic airspace than was possible with radar-era methods alone.

If you want, I can also provide a **step-by-step transatlantic flight example** showing exactly how the tracking method changes from departure, to coastal transition, to mid-ocean, to arrival.

## Sources

- https://www.icao.int/sites/default/files/APAC/Meetings/2020/2020%20SURICG5/4-Information%20Papers/IP13_Attachment%20-%20Space%20based%20ADS-B%20update%20%20SURICG_5.pdf
- https://www.icao.int/sites/default/files/APAC/Meetings/2020/2020%20ADSB%20Webinar/SP202_Space-based%20ADS-B.pdf
- https://www.faa.gov/media/96741
- https://en.wikipedia.org/wiki/Automatic_Dependent_Surveillance%E2%80%93Broadcast
- https://www.icao.int/sites/default/files/APAC/Meetings/2021/2021%20CNS%20SG%2025/4-Information%20Papers/IP24_IND-AI.6.2-Implementation-of-Space-based-ADS-B-Surveillance-for-the-Oceanic-Regions-of-Indian-FIRs.pdf
- https://www.faa.gov/about/office_org/headquarters_offices/avs/offices/afx/afs/afs400/afs410/ads-b
- https://interactive.aviationtoday.com/avionicsmagazine/august-2019/faa-chooses-enhanced-ads-c-over-space-based-ads-b-for-oceanic-airspace/
- https://aviationweek.com/air-transport/faa-takes-steps-toward-space-based-ads-b-track-aircraft
- https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC_90-114C.pdf
- https://www.icao.int/sites/default/files/EURNAT/Documents/EUR%20and%20Nat%20Docs/NAT%20Documents/NAT%20Documents/NAT%20Doc%20007/NAT-Doc-007-EN-Edition-V.2026-1-Amd-0.pdf
- https://www.faasafety.gov/files/events/WP/WP19/2022/WP19117655/ICAO_Equip_Code_Definitions.pdf
- https://www.icao.int/filebrowser/download/5216?fid=5216
- https://recursosdeaviacion.com/wp-content/uploads/2021/01/icao-doc-4444-air-traffic-management.pdf
- https://ffac.ch/wp-content/uploads/2020/10/ICAO-DOC-4444-Amendment.pdf
- https://www.bazl.admin.ch/dam/en/sd-web/jMIWMg9YgaoW/4444_cons_en.pdf
- https://skybrary.aero/sites/default/files/bookshelf/3584.pdf
- https://aviation-is.better-than.tv/ICAO%204444%20v13.pdf