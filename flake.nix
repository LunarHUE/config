{
  description = "config";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";

    claude-code = {
      url = "github:sadjow/claude-code-nix";
      inputs.nixpkgs.follows = "nixpkgs";
      inputs.flake-utils.follows = "flake-utils";
    };

    codex-cli-nix = {
      url = "github:sadjow/codex-cli-nix";
      inputs.nixpkgs.follows = "nixpkgs";
      inputs.flake-utils.follows = "flake-utils";
    };
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
    codex-cli-nix,
    claude-code,
    ...
  }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;

          config.allowUnfree = true;

          overlays = [
            claude-code.overlays.default
            codex-cli-nix.overlays.default
          ];
        };

        # Everything needed to install, build, and test. Both shells get these.
        corePackages = with pkgs; [
          bun
        ];

        # Interactive-only tooling. Kept out of ci so the CI closure stays small.
        devOnlyPackages = with pkgs; [
          bashInteractive
          bash-completion
          nix-bash-completions

          git
          gh
          ripgrep

          nodejs_24

          pkgs.claude-code
          pkgs.codex
        ];

        devShell = pkgs.mkShell {
          packages = corePackages ++ devOnlyPackages;

          BASH_COMPLETION_PATH =
            "${pkgs.bash-completion}/etc/profile.d/bash_completion.sh";

          shellHook = ''
            echo "Nix devShell ready. bun $(bun --version 2>/dev/null)"
          '';
        };
      in {
        devShells = {
          default = devShell;
          dev = devShell;

          ci = pkgs.mkShell {
            packages = corePackages;
          };
        };
      });
}
