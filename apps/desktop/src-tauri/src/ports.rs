//! Port acquisition for the two processes the shell owns.
//!
//! The old `pick_port()` did not pick anything: it read `MAGNIS_BACKEND_PORT`
//! or returned a hard-coded 3765, so a second Magnis — or any process holding
//! that port — broke startup with a bind error from the child, far from the
//! cause. Nothing bound, so nothing could detect the collision in advance.
//!
//! Here a port is *bound* before it is handed out. The listener is kept alive
//! inside [`BoundPort`] until the caller releases it, which is what makes the
//! reservation mean anything: between choosing a port and the child binding it,
//! this process is holding it.
//!
//! An explicit pin is honoured and, when unusable, is a loud error naming the
//! port — never silently replaced. That mirrors `explicit_override` in
//! `backend_process.rs`: a variable that exists to pin one specific value
//! defeats its own purpose the moment it is allowed to fall through.

use anyhow::{Context, Result};
use std::net::TcpListener;

/// A port this process has bound and is holding.
///
/// Dropping it releases the reservation. `port()` is what the child is told to
/// use; `release()` hands the port over deliberately, immediately before the
/// child is spawned.
#[derive(Debug)]
pub struct BoundPort {
    port: u16,
    listener: Option<TcpListener>,
}

impl BoundPort {
    pub fn port(&self) -> u16 {
        self.port
    }

    /// Give up the reservation so the child can bind. Returns the port so the
    /// call site reads as a handover rather than a discard.
    pub fn release(mut self) -> u16 {
        self.listener = None;
        self.port
    }
}

/// Bind a port for one role.
///
/// * `pin` — an explicit choice (from an env var). Busy ⇒ error naming it.
/// * `None` — ask the OS for a free port by binding `:0`.
///
/// `role` only shapes the error message; it is what tells an operator *which*
/// of the two processes could not be placed.
pub fn bind_port(role: &str, pin: Option<u16>) -> Result<BoundPort> {
    match pin {
        Some(port) => {
            let listener = TcpListener::bind(("127.0.0.1", port)).with_context(|| {
                format!(
                    "{role}: port {port} was pinned explicitly but is already in use — \
                     free it or change the pin; it is never silently replaced"
                )
            })?;
            Ok(BoundPort {
                port,
                listener: Some(listener),
            })
        }
        None => {
            let listener = TcpListener::bind(("127.0.0.1", 0))
                .with_context(|| format!("{role}: failed to bind a free port"))?;
            let port = listener
                .local_addr()
                .with_context(|| format!("{role}: bound listener has no local address"))?
                .port();
            Ok(BoundPort {
                port,
                listener: Some(listener),
            })
        }
    }
}

/// Parse an explicit port pin from its raw env value.
///
/// Pure so the rule is testable without touching process env, which is global
/// and would race every other test. Unset ⇒ `None` (bind a free port); set but
/// not a port number ⇒ error, because a typo that silently becomes "pick
/// anything" is the failure this whole module exists to remove.
pub fn parse_pin(role: &str, raw: Option<String>) -> Result<Option<u16>> {
    match raw.map(|v| v.trim().to_string()).filter(|v| !v.is_empty()) {
        None => Ok(None),
        Some(v) => v
            .parse::<u16>()
            .map(Some)
            .with_context(|| format!("{role}: port pin {v:?} is not a valid port number")),
    }
}

#[cfg(test)]
mod tests {
    use super::{bind_port, parse_pin};
    use std::net::TcpListener;

    // @test-id: tst_desktop_port_001
    // @invariant: INV-DTR-2, INV-DTR-3
    // @covers: ports::bind_port, ports::parse_pin
    // @deterministic: yes
    // @fixtures: a real listener occupying a port this test bound itself
    #[test]
    fn tst_desktop_port_001_pinned_busy_is_loud_and_free_ports_are_bound() {
        // A pinned port that is occupied must NAME itself in the error. The
        // occupied port is one we bound, so the test never depends on what else
        // happens to be running on the box.
        let squatter = TcpListener::bind(("127.0.0.1", 0)).expect("bind squatter");
        let taken = squatter.local_addr().expect("addr").port();

        let err = bind_port("backend", Some(taken)).expect_err("a busy pin must not fall through");
        let text = format!("{err:#}");
        assert!(
            text.contains(&taken.to_string()),
            "error must name the port: {text}"
        );
        assert!(
            text.contains("never silently replaced"),
            "error must say the pin is not substituted: {text}"
        );

        // Unpinned: each role gets a port that this process is actually
        // holding, and the two roles never collide.
        let backend = bind_port("backend", None).expect("bind backend");
        let postgres = bind_port("postgres", None).expect("bind postgres");
        assert_ne!(
            backend.port(),
            postgres.port(),
            "two roles must not be handed the same port"
        );
        for p in [backend.port(), postgres.port()] {
            assert!(
                TcpListener::bind(("127.0.0.1", p)).is_err(),
                "port {p} must be held by us while reserved — otherwise the \
                 reservation means nothing"
            );
        }

        // Releasing hands it over: the port becomes bindable again, which is
        // exactly what the child needs immediately after.
        let handed = backend.release();
        assert!(
            TcpListener::bind(("127.0.0.1", handed)).is_ok(),
            "release must free the port for the child"
        );

        // A pin that is free is honoured verbatim.
        let free = bind_port("backend", None).expect("bind for pin");
        let wanted = free.release();
        let pinned = bind_port("backend", Some(wanted)).expect("free pin is honoured");
        assert_eq!(pinned.port(), wanted);
    }

    // @test-id: tst_desktop_port_002
    // @invariant: INV-DTR-3
    // @covers: ports::parse_pin
    // @deterministic: yes
    #[test]
    fn tst_desktop_port_002_pin_parsing_is_explicit() {
        assert_eq!(parse_pin("backend", None).expect("unset is fine"), None);
        assert_eq!(
            parse_pin("backend", Some("  ".into())).expect("blank"),
            None
        );
        assert_eq!(
            parse_pin("backend", Some("3765".into())).expect("valid"),
            Some(3765)
        );
        let err = parse_pin("backend", Some("not-a-port".into()))
            .expect_err("a malformed pin must not become 'pick anything'");
        assert!(format!("{err:#}").contains("not-a-port"));
    }
}
