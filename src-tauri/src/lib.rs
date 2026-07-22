use serde::Serialize;

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct RuntimeInfo {
    engine: &'static str,
    renderer: &'static str,
    schema: &'static str,
}

fn runtime_info() -> RuntimeInfo {
    RuntimeInfo {
        engine: "Rust/Tauri host",
        renderer: "Three.js",
        schema: "Zod",
    }
}

#[tauri::command]
fn neural_runtime_info() -> RuntimeInfo {
    runtime_info()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![neural_runtime_info])
        .run(tauri::generate_context!())
        .expect("failed to start the Sinapse Formalista runtime");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_the_cross_stack_runtime() {
        assert_eq!(
            runtime_info(),
            RuntimeInfo {
                engine: "Rust/Tauri host",
                renderer: "Three.js",
                schema: "Zod",
            }
        );
    }
}
