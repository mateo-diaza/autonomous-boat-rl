"""Control manual del barco con el teclado (para probar la física y la recompensa).

    ← / →  girar      R  nuevo escenario      ESC  salir

Uso: python -m training.play [--obstacles 6] [--seed 0]
"""

import argparse

import pygame

from training.boat_env import BoatEnv


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--obstacles", type=int, default=6)
    parser.add_argument("--seed", type=int, default=None)
    args = parser.parse_args()

    env = BoatEnv(n_obstacles=args.obstacles, render_mode="human")
    env.reset(seed=args.seed)
    env.overlay_text = "manual: <- ->  R  ESC"

    running = True
    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT or (event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE):
                running = False
            elif event.type == pygame.KEYDOWN and event.key == pygame.K_r:
                env.reset()

        keys = pygame.key.get_pressed()
        action = 0 if keys[pygame.K_LEFT] else 2 if keys[pygame.K_RIGHT] else 1
        _, _, terminated, truncated, info = env.step(action)

        if terminated or truncated:
            print(f"{info['event']:8s} pasos={env.steps:4d} retorno={env.episode_return:8.1f}")
            pygame.time.wait(800)
            env.reset()

    env.close()


if __name__ == "__main__":
    main()
