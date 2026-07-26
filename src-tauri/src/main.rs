// Sem esta diretiva, o Windows abre um console junto da interface na versão de produção.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    brain_pro_lib::run()
}
